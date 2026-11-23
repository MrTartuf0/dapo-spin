#include "DapoOTA.h"
#include <string.h>

#ifndef DAPO_HOST_TEST
#include "nrf.h"
#else
// nel test sul PC la flash è un array (vedi tests/firmware-sim)
extern uint8_t g_flash[];
extern bool g_swapCalled;
#endif

namespace dapo_ota {

// ---------------- mappa della flash ----------------
static const uint32_t APP_START     = 0x27000;
static const uint32_t STAGING_START = 0x8A000;
static const uint32_t STAGING_END   = 0xED000;
static const uint32_t PAGE          = 4096;
static const uint32_t SETTINGS_ADDR = 0xFF000;   // impostazioni del bootloader Adafruit (nRF52840)
static const uint32_t MAX_IMAGE     = STAGING_END - STAGING_START;   // 0x63000 = 405504 byte
static_assert(STAGING_START - APP_START == MAX_IMAGE, "app e staging devono avere la stessa dimensione");

// ---------------- Bluetooth ----------------
BLEService service("a7f3c110-5d2e-4f8b-9e61-3c0d7b2a9e10");
static BLECharacteristic ctrlChar("a7f3c111-5d2e-4f8b-9e61-3c0d7b2a9e10", BLEWrite | BLENotify, 20);
static BLECharacteristic dataChar("a7f3c112-5d2e-4f8b-9e61-3c0d7b2a9e10", BLEWriteWithoutResponse, 20);

// ---------------- stato ----------------
enum State : uint8_t { IDLE, ERASING, RECEIVING, VERIFYING, VERIFIED, APPLYING };
static State state = IDLE;
static uint32_t imgSize = 0, padSize = 0, imgCrc = 0;
static uint32_t expected = 0;                 // prossimo offset atteso
static uint32_t erasePage = 0, eraseSlices = 0;
static uint32_t crcPos = 0, crcRun = 0;
static uint32_t applyAtMs = 0;
static volatile bool wantAck = false;
static uint8_t pendingErr = 0;
static bool pendingVerify = false, verifyOk = false, pendingApplyAck = false;

enum Err : uint8_t { E_TOO_BIG = 1, E_STATE = 2, E_CRC = 3, E_FLASH = 4 };

// ---------------- accesso alla flash ----------------
#ifdef DAPO_HOST_TEST
static const uint8_t* flashPtr(uint32_t a) { return &g_flash[a]; }
static bool flashEraseSlice(uint32_t a) { memset(&g_flash[a], 0xFF, PAGE); return true; }
static void flashWrite16(uint32_t a, const uint8_t* src) { for (int i = 0; i < 16; i++) g_flash[a + i] &= src[i]; }
static void swapAndReset(uint32_t size, const uint8_t* settings) {
  memcpy(&g_flash[APP_START], &g_flash[STAGING_START], (size + PAGE - 1) / PAGE * PAGE);
  if (settings) memcpy(&g_flash[SETTINGS_ADDR], settings, PAGE);
  g_swapCalled = true;
}
#else
static const uint8_t* flashPtr(uint32_t a) { return (const uint8_t*)a; }
static inline void nvmcWait() { while (NRF_NVMC->READY == NVMC_READY_READY_Busy) {} }

// cancella una "fetta" da 10 ms: con le pagine intere (85 ms) il Bluetooth perderebbe colpi
static bool flashEraseSlice(uint32_t a) {
  NRF_NVMC->ERASEPAGEPARTIALCFG = 10;
  NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Een; nvmcWait();
  NRF_NVMC->ERASEPAGEPARTIAL = a; nvmcWait();
  NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; nvmcWait();
  return true;
}
static void flashWrite16(uint32_t a, const uint8_t* src) {
  NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Wen; nvmcWait();
  for (int i = 0; i < 4; i++) {
    uint32_t w; memcpy(&w, src + 4 * i, 4);
    *(volatile uint32_t*)(a + 4 * i) = w;
    nvmcWait();
  }
  NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; nvmcWait();
}

// Gira dalla RAM (sezione .data, copiata all'avvio): sovrascrive l'app con lo staging,
// aggiorna le impostazioni del bootloader se serve e riavvia. Niente chiamate a funzioni
// in flash qui dentro: la flash dell'app viene cancellata mentre gira.
__attribute__((section(".data.dapo_ota_swap"), noinline, long_call, used))
static void swapAndReset(uint32_t size, const uint8_t* settings) {
  uint32_t pages = (size + PAGE - 1) / PAGE;
  for (uint32_t p = 0; p < pages; p++) {
    uint32_t dst = APP_START + p * PAGE, src = STAGING_START + p * PAGE;
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Een; while (NRF_NVMC->READY == 0) {}
    NRF_NVMC->ERASEPAGE = dst;              while (NRF_NVMC->READY == 0) {}
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Wen; while (NRF_NVMC->READY == 0) {}
    for (uint32_t w = 0; w < PAGE / 4; w++) {
      *(volatile uint32_t*)(dst + 4 * w) = *(volatile const uint32_t*)(src + 4 * w);
      while (NRF_NVMC->READY == 0) {}
    }
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; while (NRF_NVMC->READY == 0) {}
  }
  if (settings) {
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Een; while (NRF_NVMC->READY == 0) {}
    NRF_NVMC->ERASEPAGE = SETTINGS_ADDR;    while (NRF_NVMC->READY == 0) {}
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Wen; while (NRF_NVMC->READY == 0) {}
    for (uint32_t w = 0; w < PAGE / 4; w++) {
      *(volatile uint32_t*)(SETTINGS_ADDR + 4 * w) = ((volatile const uint32_t*)settings)[w];
      while (NRF_NVMC->READY == 0) {}
    }
    NRF_NVMC->CONFIG = NVMC_CONFIG_WEN_Ren; while (NRF_NVMC->READY == 0) {}
  }
  __DSB();
  SCB->AIRCR = (0x5FAUL << SCB_AIRCR_VECTKEY_Pos) | SCB_AIRCR_SYSRESETREQ_Msk;
  __DSB();
  for (;;) {}
}
#endif

static bool pageIsErased(uint32_t a) {
  const uint32_t* w = (const uint32_t*)flashPtr(a);
  for (uint32_t i = 0; i < PAGE / 4; i++) if (w[i] != 0xFFFFFFFFu) return false;
  return true;
}

// CRC-32 (lo stesso di zlib e del browser), a tabella da 16 voci
static uint32_t crc32Update(uint32_t crc, const uint8_t* p, uint32_t n) {
  static const uint32_t T[16] = {
    0x00000000, 0x1DB71064, 0x3B6E20C8, 0x26D930AC, 0x76DC4190, 0x6B6B51F4, 0x4DB26158, 0x5005713C,
    0xEDB88320, 0xF00F9344, 0xD6D6A3E8, 0xCB61B38C, 0x9B64C2B0, 0x86D3D2D4, 0xA00AE278, 0xBDBDF21C };
  crc = ~crc;
  while (n--) { crc ^= *p++; crc = (crc >> 4) ^ T[crc & 15]; crc = (crc >> 4) ^ T[crc & 15]; }
  return ~crc;
}

// ---------------- notifiche ----------------
static void notify(const uint8_t* b, int n) { ctrlChar.writeValue(b, n); }
static void put32(uint8_t* b, uint32_t v) { b[0] = v; b[1] = v >> 8; b[2] = v >> 16; b[3] = v >> 24; }
static uint32_t get32(const uint8_t* b) { return b[0] | (b[1] << 8) | ((uint32_t)b[2] << 16) | ((uint32_t)b[3] << 24); }
static void sendAck() { uint8_t b[5] = {'K'}; put32(b + 1, expected); notify(b, 5); }
static void sendErr(uint8_t code) { uint8_t b[2] = {'E', code}; notify(b, 2); }

// ---------------- comandi ----------------
static void onCtrl(BLEDevice, BLECharacteristic c) {
  const uint8_t* v = c.value();
  int n = c.valueLength();
  if (n < 1) return;
  switch (v[0]) {
    case 'B':                                       // inizio: dimensione + CRC32
      if (n < 9) { pendingErr = E_STATE; return; }
      if (state == APPLYING) { pendingErr = E_STATE; return; }
      imgSize = get32(v + 1); imgCrc = get32(v + 5);
      if (imgSize == 0 || imgSize > MAX_IMAGE) { state = IDLE; pendingErr = E_TOO_BIG; return; }
      padSize = (imgSize + 15) & ~15u;
      expected = 0; erasePage = 0; eraseSlices = 0;
      state = ERASING;
      break;
    case 'Q':                                       // a che punto sei?
      wantAck = true;
      break;
    case 'V':                                       // controlla il CRC
      if (state != RECEIVING || expected < padSize) { pendingErr = E_STATE; return; }
      crcPos = 0; crcRun = 0; state = VERIFYING;
      break;
    case 'A':                                       // applica e riavvia
      if (state != VERIFIED) { pendingErr = E_STATE; return; }
      state = APPLYING; pendingApplyAck = true; applyAtMs = millis() + 400;
      break;
    case 'X':                                       // annulla
      if (state != APPLYING) state = IDLE;
      break;
  }
}

static void onData(BLEDevice, BLECharacteristic c) {
  if (state != RECEIVING || c.valueLength() < 20) return;
  const uint8_t* v = c.value();
  uint32_t off = get32(v);
  if (off != expected || off + 16 > padSize) return;   // pacchetto perso o ripetuto: il browser riparte da 'K'
  flashWrite16(STAGING_START + off, v + 4);
  expected += 16;
}

void begin() {
  service.addCharacteristic(ctrlChar);
  service.addCharacteristic(dataChar);
  ctrlChar.setEventHandler(BLEWritten, onCtrl);
  dataChar.setEventHandler(BLEWritten, onData);
}

bool busy() { return state != IDLE && state != VERIFIED; }
uint32_t maxImageSize() { return MAX_IMAGE; }

static uint8_t settingsCopy[PAGE];

static void apply() {
  // Se l'app era stata caricata via seriale (Arduino IDE) il bootloader ne conosce il CRC16:
  // con il firmware nuovo non tornerebbe più. Mettiamo crc = 0, che per il bootloader vuol dire
  // "non controllare". Con impostazioni vuote o già a 0 non tocchiamo niente.
  const uint8_t* s = flashPtr(SETTINGS_ADDR);
  uint16_t bank0 = s[0] | (s[1] << 8), crc16 = s[2] | (s[3] << 8);
  const uint8_t* fix = nullptr;
  if (bank0 == 0x0001 && crc16 != 0) {
    memcpy(settingsCopy, s, PAGE);
    settingsCopy[2] = settingsCopy[3] = 0;          // bank_0_crc
    put32(settingsCopy + 8, imgSize);               // bank_0_size
    fix = settingsCopy;
  }
#ifndef DAPO_HOST_TEST
  __disable_irq();
  MPU->CTRL = 0;                                    // la RAM deve poter eseguire codice
#endif
  swapAndReset(padSize, fix);
}

void poll() {
  if (pendingErr) { sendErr(pendingErr); pendingErr = 0; }

  if (state == ERASING) {
    uint32_t a = STAGING_START + erasePage * PAGE;
    if (erasePage * PAGE >= padSize) {
      state = RECEIVING; sendAck();                 // pronto a ricevere da offset 0
    } else if (eraseSlices == 0 && pageIsErased(a)) {
      erasePage++;                                  // già vuota: salta
    } else {
      flashEraseSlice(a);
      if (++eraseSlices >= 10) {
        if (pageIsErased(a)) { erasePage++; eraseSlices = 0; }
        else if (eraseSlices > 30) { state = IDLE; sendErr(E_FLASH); }
      }
    }
  }

  if (state == VERIFYING) {                         // CRC a pezzi da 16 KB, per non bloccare il Bluetooth
    uint32_t n = imgSize - crcPos; if (n > 16384) n = 16384;
    crcRun = crc32Update(crcRun, flashPtr(STAGING_START + crcPos), n);
    crcPos += n;
    if (crcPos >= imgSize) {
      verifyOk = (crcRun == imgCrc);
      state = verifyOk ? VERIFIED : IDLE;
      pendingVerify = true;
    }
  }
  if (pendingVerify) {
    uint8_t b[6] = {'V', (uint8_t)verifyOk}; put32(b + 2, crcRun); notify(b, 6);
    pendingVerify = false;
  }

  if (wantAck) { wantAck = false; sendAck(); }

  if (state == APPLYING) {
    if (pendingApplyAck) { uint8_t b[1] = {'A'}; notify(b, 1); pendingApplyAck = false; }
    if ((int32_t)(millis() - applyAtMs) >= 0) apply();
  }
}

#ifdef DAPO_HOST_TEST
BLECharacteristic& test_ctrl() { return ctrlChar; }
BLECharacteristic& test_data() { return dataChar; }
void reset_for_test() { state = IDLE; pendingErr = 0; pendingVerify = false; pendingApplyAck = false; wantAck = false; g_swapCalled = false; }
#endif

void enterBootloaderOta() {
#ifndef DAPO_HOST_TEST
  NRF_POWER->GPREGRET = 0xA8;                       // DFU_MAGIC_OTA_RESET del bootloader Adafruit
  NVIC_SystemReset();
#endif
}

}  // namespace dapo_ota
