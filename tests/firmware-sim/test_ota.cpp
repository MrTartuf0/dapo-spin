// Test dell'aggiornamento via Bluetooth (firmware/DapoIMU/DapoOTA.cpp) sul computer.
// La flash è un array, il "browser" è questo file: manda un firmware finto con il protocollo
// di docs/protocollo-dati.md perdendo apposta un po' di pacchetti, e controlla che:
//   - l'immagine arrivi intera nello staging e il CRC32 torni
//   - "applica" copi lo staging sull'app e sistemi le impostazioni del bootloader
//   - immagini troppo grandi o con CRC sbagliato vengano rifiutate
//
//   make            (oppure: make test_ota && ./test_ota)

#include "Arduino.h"
#include "ArduinoBLE.h"
#include "../../firmware/DapoIMU/DapoOTA.h"
#include <random>
#include <vector>

uint64_t g_simUs = 0;
MockSerial Serial;
MockBLE BLE;
uint8_t g_flash[0x100000];
bool g_swapCalled = false;

static const uint32_t APP = 0x27000, STAGING = 0x8A000, SETTINGS = 0xFF000;

// in DapoOTA.cpp le caratteristiche sono statiche: la build di test (DAPO_HOST_TEST) le espone così
namespace dapo_ota {
BLECharacteristic& test_ctrl();
BLECharacteristic& test_data();
void reset_for_test();
}
static BLECharacteristic& otaCtrl() { return dapo_ota::test_ctrl(); }
static BLECharacteristic& otaData() { return dapo_ota::test_data(); }

static uint32_t crc32(const uint8_t* p, size_t n) {
  uint32_t c = 0xFFFFFFFF;
  while (n--) { c ^= *p++; for (int k = 0; k < 8; k++) c = (c >> 1) ^ (0xEDB88320 & -(c & 1)); }
  return ~c;
}

static int failures = 0;
static void check(bool ok, const char* what, double v) {
  printf("%s %-54s %10.0f\n", ok ? "OK  " : "FAIL", what, v);
  if (!ok) failures++;
}

static void ctrl(std::vector<uint8_t> b) { otaCtrl().centralWrite(b.data(), (int)b.size()); }
static void put32(std::vector<uint8_t>& b, uint32_t v) { for (int i = 0; i < 4; i++) b.push_back(v >> (8 * i)); }
static uint32_t get32(const std::vector<uint8_t>& b, int at) { return b[at] | b[at + 1] << 8 | b[at + 2] << 16 | (uint32_t)b[at + 3] << 24; }

// fa girare loop() finché arriva una notifica nuova (o scade)
static std::vector<uint8_t> waitNote(size_t before, int maxPolls = 200000) {
  for (int i = 0; i < maxPolls; i++) {
    dapo_ota::poll(); g_simUs += 1000;
    if (otaCtrl().sent->size() > before) return (*otaCtrl().sent)[before];
  }
  return {};
}

// trasferimento completo come farà il browser: finestre da 32 pacchetti, poi 'Q'
static bool transfer(const std::vector<uint8_t>& img, double lossRate, int& windows) {
  std::mt19937 rng(7);
  std::uniform_real_distribution<double> u(0, 1);
  size_t pad = (img.size() + 15) & ~size_t(15);
  std::vector<uint8_t> padded(img); padded.resize(pad, 0xFF);

  size_t n0 = otaCtrl().sent->size();
  std::vector<uint8_t> b = {'B'}; put32(b, (uint32_t)img.size()); put32(b, crc32(img.data(), img.size()));
  ctrl(b);
  auto k = waitNote(n0);
  if (k.size() != 5 || k[0] != 'K' || get32(k, 1) != 0) return false;

  uint32_t next = 0; windows = 0;
  while (next < pad) {
    for (int i = 0; i < 32 && next + 16 * i < pad; i++) {
      uint32_t off = next + 16 * i;
      if (u(rng) < lossRate) continue;               // pacchetto perso per strada
      uint8_t pkt[20] = {(uint8_t)off, (uint8_t)(off >> 8), (uint8_t)(off >> 16), (uint8_t)(off >> 24)};
      memcpy(pkt + 4, &padded[off], 16);
      otaData().centralWrite(pkt, 20);
    }
    size_t before = otaCtrl().sent->size();
    ctrl({'Q'});
    auto ack = waitNote(before);
    if (ack.size() != 5 || ack[0] != 'K') return false;
    next = get32(ack, 1);
    if (++windows > 100000) return false;
  }
  return true;
}

int main() {
  memset(g_flash, 0xFF, sizeof g_flash);
  dapo_ota::begin();

  // firmware "vecchio" nell'app e impostazioni del bootloader come dopo un caricamento da Arduino IDE
  for (uint32_t i = 0; i < 300000; i++) g_flash[APP + i] = (uint8_t)(i * 7);
  g_flash[SETTINGS + 0] = 0x01; g_flash[SETTINGS + 1] = 0x00;     // bank_0 = BANK_VALID_APP
  g_flash[SETTINGS + 2] = 0x34; g_flash[SETTINGS + 3] = 0x12;     // bank_0_crc = 0x1234
  g_flash[SETTINGS + 8] = 0xE0; g_flash[SETTINGS + 9] = 0x93; g_flash[SETTINGS + 10] = 0x04;   // bank_0_size = 300000
  // un po' di spazzatura nello staging, da cancellare
  for (int i = 0; i < 5000; i++) g_flash[STAGING + i * 13] = 0;

  // firmware nuovo: 351 637 byte (non multiplo di 16) con contenuto pseudo-casuale
  std::mt19937 rng(42);
  std::vector<uint8_t> img(351637);
  for (auto& c : img) c = (uint8_t)rng();

  check(dapo_ota::maxImageSize() == 405504, "dimensione massima (byte)", dapo_ota::maxImageSize());

  int windows = 0;
  bool ok = transfer(img, 0.03, windows);
  check(ok, "trasferimento con il 3% di pacchetti persi (finestre)", windows);
  check(memcmp(&g_flash[STAGING], img.data(), img.size()) == 0, "staging identico al firmware nuovo (byte)", (double)img.size());

  size_t before = otaCtrl().sent->size();
  ctrl({'V'});
  auto v = waitNote(before);
  check(v.size() == 6 && v[0] == 'V' && v[1] == 1, "CRC32 verificato sulla scheda", v.size() == 6 ? get32(v, 2) : 0);
  check(!dapo_ota::busy(), "dopo la verifica la scheda non è più occupata", 0);

  before = otaCtrl().sent->size();
  ctrl({'A'});
  auto a = waitNote(before);
  check(a.size() == 1 && a[0] == 'A', "conferma 'A' prima del riavvio", 0);
  for (int i = 0; i < 1000 && !g_swapCalled; i++) { dapo_ota::poll(); g_simUs += 1000; }
  check(g_swapCalled, "copia dallo staging all'app eseguita", 0);
  check(memcmp(&g_flash[APP], img.data(), img.size()) == 0, "app = firmware nuovo (byte)", (double)img.size());
  uint16_t crcAfter = g_flash[SETTINGS + 2] | g_flash[SETTINGS + 3] << 8;
  uint32_t sizeAfter = g_flash[SETTINGS + 8] | g_flash[SETTINGS + 9] << 8 | g_flash[SETTINGS + 10] << 16 | (uint32_t)g_flash[SETTINGS + 11] << 24;
  check(crcAfter == 0 && g_flash[SETTINGS] == 1, "bootloader: app valida, CRC16 disattivato", crcAfter);
  check(sizeAfter == img.size(), "bootloader: dimensione dell'app aggiornata", sizeAfter);

  // --- casi da rifiutare (si riparte come da una scheda appena riavviata) ---
  dapo_ota::reset_for_test();
  before = otaCtrl().sent->size();
  { std::vector<uint8_t> b = {'B'}; put32(b, 500000); put32(b, 0); ctrl(b); }
  auto e = waitNote(before, 10);
  check(e.size() == 2 && e[0] == 'E' && e[1] == 1, "immagine troppo grande rifiutata (codice)", e.size() == 2 ? e[1] : -1);

  std::vector<uint8_t> img2(20000, 0x5A);
  std::vector<uint8_t> bad = img2;                   // CRC dichiarato di un'immagine diversa
  bad[100] ^= 1;
  {
    size_t n0 = otaCtrl().sent->size();
    std::vector<uint8_t> b = {'B'}; put32(b, (uint32_t)img2.size()); put32(b, crc32(bad.data(), bad.size())); ctrl(b);
    waitNote(n0);
    for (uint32_t off = 0; off < img2.size(); off += 16) {
      uint8_t pkt[20] = {(uint8_t)off, (uint8_t)(off >> 8), (uint8_t)(off >> 16), (uint8_t)(off >> 24)};
      memcpy(pkt + 4, &img2[off], 16);
      otaData().centralWrite(pkt, 20);
    }
    before = otaCtrl().sent->size();
    ctrl({'V'});
    auto v2 = waitNote(before);
    check(v2.size() == 6 && v2[1] == 0, "CRC sbagliato rifiutato", v2.size() == 6 ? v2[1] : -1);
    before = otaCtrl().sent->size();
    ctrl({'A'});
    auto e2 = waitNote(before, 10);
    check(e2.size() == 2 && e2[0] == 'E' && e2[1] == 2, "'applica' senza verifica rifiutato (codice)", e2.size() == 2 ? e2[1] : -1);
  }

  printf(failures ? "\n%d controlli falliti\n" : "\nTutto ok\n", failures);
  return failures ? 1 : 0;
}
