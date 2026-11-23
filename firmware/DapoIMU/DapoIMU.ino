/*
  DapoIMU — firmware per Seeed XIAO nRF52840 Sense
  ------------------------------------------------
  Core Arduino:  "Seeed nRF52 mbed-enabled Boards"  ->  scheda "XIAO nRF52840 Sense"
  Librerie:      "Seeed Arduino LSM6DS3"  +  "ArduinoBLE"

  Cosa fa:
   - legge l'IMU LSM6DS3TR-C a 416 Hz con fondo scala ±16 g e ±2000 °/s
     (una dapo che gira satura subito i ±2 g di default)
   - stima l'orientamento (quaternione) con un filtro Mahony:
       * il giroscopio viene integrato in modo esatto (va bene anche a giri alti)
       * l'accelerometro corregge l'inclinazione SOLO quando misura ~1 g e la dapo
         non sta girando forte: durante spin e lanci la forza centrifuga e la caduta
         libera lo renderebbero bugiardo
       * il bias del giroscopio si calibra all'avvio e si riaggiusta da solo
         quando la scheda è ferma
   - manda i dati in due modi (puoi usarli insieme):
       * USB seriale 115200: righe CSV  D,ms,ax,ay,az,gx,gy,gz,qw,qx,qy,qz
       * Bluetooth LE "DapoIMU": pacchetti da 20 byte a 50 Hz (vedi sendBle())
   - comandi (da seriale o BLE):  'c' = ricalibra giroscopio (tienila ferma)
                                  'r' = reset orientamento (livella con la gravità)
                                  'v' = scrive la versione del firmware
                                  'u' = riavvia nel bootloader in modalità OTA (app nRF Connect)
   - aggiornamento del firmware dal browser via Bluetooth: DapoOTA.h, pagina /firmware del sito

  LED sulla scheda:  rosso = calibrazione,  blu = BLE connesso,  verde lampeggiante = in attesa
  Assi: quelli stampati dall'IMU. Con la scheda appoggiata a faccia in su, az ≈ +1 g.
  Il giroscopio da solo non sa dov'è il nord: la rotazione attorno alla verticale (yaw)
  deriva lentamente. Il pulsante "Zero" del visualizzatore la riallinea.
*/

#include <Arduino.h>
#include <Wire.h>
#include <LSM6DS3.h>
#include <ArduinoBLE.h>
#include "version.h"
#include "DapoOTA.h"

// ---------------- impostazioni ----------------
const uint32_t IMU_PERIOD_US    = 2400;   // ~416 Hz, come l'ODR del sensore
const uint32_t SERIAL_PERIOD_US = 10000;  // 100 Hz su USB
const uint32_t BLE_PERIOD_US    = 20000;  // 50 Hz su Bluetooth

const float KP_ACC        = 1.5f;   // quanto forte l'accelerometro corregge l'inclinazione
const float ACC_TOL_G     = 0.15f;  // corregge solo se | |a| - 1g | < 0.15 g
const float GYRO_GATE_DPS = 300.0f; // sopra questa velocità di rotazione niente correzione

const char* BLE_NAME   = "DapoIMU";
const char* SVC_UUID   = "a7f3c100-5d2e-4f8b-9e61-3c0d7b2a9e10";
const char* DATA_UUID  = "a7f3c101-5d2e-4f8b-9e61-3c0d7b2a9e10";
const char* CMD_UUID   = "a7f3c102-5d2e-4f8b-9e61-3c0d7b2a9e10";

// ---------------- oggetti ----------------
LSM6DS3 imu(I2C_MODE, 0x6A);

BLEService        imuService(SVC_UUID);
BLECharacteristic dataChar(DATA_UUID, BLERead | BLENotify, 20, true);
BLECharacteristic cmdChar(CMD_UUID, BLEWrite | BLEWriteWithoutResponse, 4);
BLECharacteristic infoChar("a7f3c103-5d2e-4f8b-9e61-3c0d7b2a9e10", BLERead, 96);
bool bleOk = false;

// ---------------- stato ----------------
struct Quat { float w, x, y, z; };
Quat q = {1, 0, 0, 0};

float ax, ay, az;            // g
float gx, gy, gz;            // °/s, bias già tolto
float biasX, biasY, biasZ;   // °/s
uint32_t stillSince = 0;     // per l'auto-calibrazione del bias

uint32_t tImu = 0, tSerial = 0, tBle = 0, tLed = 0;

static const float DEG2RAD = 0.017453292519943295f;

// ---------------- LED (attivi bassi) ----------------
void setLed(bool r, bool g, bool b) {
  digitalWrite(LEDR, r ? LOW : HIGH);
  digitalWrite(LEDG, g ? LOW : HIGH);
  digitalWrite(LEDB, b ? LOW : HIGH);
}

// ---------------- lettura IMU (burst di 12 byte: gyro poi accel) ----------------
bool readImuRaw(float& rax, float& ray, float& raz, float& rgx, float& rgy, float& rgz) {
  uint8_t b[12];
  if (imu.readRegisterRegion(b, LSM6DS3_ACC_GYRO_OUTX_L_G, 12) != IMU_SUCCESS) return false;
  int16_t v[6];
  for (int i = 0; i < 6; i++) v[i] = (int16_t)(b[2 * i] | (b[2 * i + 1] << 8));
  rgx = imu.calcGyro(v[0]);  rgy = imu.calcGyro(v[1]);  rgz = imu.calcGyro(v[2]);
  rax = imu.calcAccel(v[3]); ray = imu.calcAccel(v[4]); raz = imu.calcAccel(v[5]);
  return true;
}

// ---------------- quaternioni ----------------
void normalize(Quat& a) {
  float n = sqrtf(a.w * a.w + a.x * a.x + a.y * a.y + a.z * a.z);
  if (n < 1e-9f) { a = {1, 0, 0, 0}; return; }
  a.w /= n; a.x /= n; a.y /= n; a.z /= n;
}

Quat mul(const Quat& a, const Quat& b) {
  return {
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
  };
}

// orientamento "a bolla": allinea la gravità misurata con l'asse Z del mondo, yaw = 0
void levelFromAccel() {
  float n = sqrtf(ax * ax + ay * ay + az * az);
  if (n < 0.5f) return;                       // in caduta libera non ha senso
  float x = ax / n, y = ay / n, z = az / n;
  if (z < -0.9999f) { q = {0, 1, 0, 0}; return; }  // capovolta
  q = {1.0f + z, y, -x, 0};
  normalize(q);
}

// ---------------- calibrazione bias giroscopio ----------------
void calibrateGyro() {
  setLed(true, false, false);
  if (Serial) Serial.println("# calibrazione giroscopio: tienila ferma...");
  for (int attempt = 0; attempt < 3; attempt++) {
    const int N = 400;                        // ~1 s
    double sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, szz = 0;
    float rax, ray, raz, rgx, rgy, rgz;
    int n = 0;
    while (n < N) {
      if (readImuRaw(rax, ray, raz, rgx, rgy, rgz)) {
        sx += rgx; sy += rgy; sz += rgz;
        sxx += rgx * rgx; syy += rgy * rgy; szz += rgz * rgz;
        n++;
      }
      if (bleOk) BLE.poll();                  // tiene viva la connessione Bluetooth
      delayMicroseconds(IMU_PERIOD_US);
    }
    float mx = sx / N, my = sy / N, mz = sz / N;
    float var = (sxx / N - mx * mx) + (syy / N - my * my) + (szz / N - mz * mz);
    if (var < 1.0f) {                         // abbastanza ferma
      biasX = mx; biasY = my; biasZ = mz;
      if (Serial) { Serial.print("# bias gyro (°/s): "); Serial.print(biasX, 2); Serial.print(' ');
                    Serial.print(biasY, 2); Serial.print(' '); Serial.println(biasZ, 2); }
      readImuRaw(ax, ay, az, rgx, rgy, rgz);
      levelFromAccel();
      setLed(false, false, false);
      return;
    }
    if (Serial) Serial.println("# si muove, riprovo...");
  }
  if (Serial) Serial.println("# calibrazione saltata (troppo movimento), il bias si aggiusterà da fermo");
  setLed(false, false, false);
}

// ---------------- filtro di orientamento ----------------
void updateFusion(float dt) {
  float wx = gx * DEG2RAD, wy = gy * DEG2RAD, wz = gz * DEG2RAD;
  float rateDps = sqrtf(gx * gx + gy * gy + gz * gz);
  float an = sqrtf(ax * ax + ay * ay + az * az);

  // peso della correzione: 1 da ferma, 0 durante spin forti / lanci / colpi
  float wAcc = 1.0f - fabsf(an - 1.0f) / ACC_TOL_G;
  float wRot = 1.0f - rateDps / GYRO_GATE_DPS;
  float gate = (wAcc > 0 && wRot > 0) ? wAcc * wRot : 0.0f;

  if (gate > 0) {
    float ux = ax / an, uy = ay / an, uz = az / an;
    // "su" stimato nel riferimento della scheda
    float vx = 2.0f * (q.x * q.z - q.w * q.y);
    float vy = 2.0f * (q.y * q.z + q.w * q.x);
    float vz = 1.0f - 2.0f * (q.x * q.x + q.y * q.y);
    float ex = uy * vz - uz * vy;
    float ey = uz * vx - ux * vz;
    float ez = ux * vy - uy * vx;
    float k = KP_ACC * gate;
    wx += k * ex; wy += k * ey; wz += k * ez;
  }

  // integrazione esatta: q = q ⊗ exp(ω·dt/2)
  float w = sqrtf(wx * wx + wy * wy + wz * wz);
  Quat dq;
  if (w * dt > 1e-6f) {
    float half = 0.5f * w * dt;
    float s = sinf(half) / w;
    dq = {cosf(half), wx * s, wy * s, wz * s};
  } else {
    dq = {1.0f, 0.5f * wx * dt, 0.5f * wy * dt, 0.5f * wz * dt};
  }
  q = mul(q, dq);
  normalize(q);
}

// auto-aggiustamento del bias quando la scheda è ferma da almeno mezzo secondo
void trackBias(float rgx, float rgy, float rgz, uint32_t nowMs) {
  float an = sqrtf(ax * ax + ay * ay + az * az);
  bool still = fabsf(gx) < 3.0f && fabsf(gy) < 3.0f && fabsf(gz) < 3.0f && fabsf(an - 1.0f) < 0.05f;
  if (!still) { stillSince = 0; return; }
  if (stillSince == 0) { stillSince = nowMs; return; }
  if (nowMs - stillSince > 500) {
    const float a = 0.002f;
    biasX += a * (rgx - biasX);
    biasY += a * (rgy - biasY);
    biasZ += a * (rgz - biasZ);
  }
}

// ---------------- output ----------------
// scrive un numero con N decimali senza usare printf con i float
char* putFixed(char* p, float v, int decimals) {
  static const long pow10[] = {1, 10, 100, 1000, 10000, 100000};
  long scale = pow10[decimals];
  long iv = lroundf(v * scale);
  if (iv < 0) { *p++ = '-'; iv = -iv; }
  long ip = iv / scale, fp = iv % scale;
  char tmp[12]; int n = 0;
  do { tmp[n++] = '0' + (ip % 10); ip /= 10; } while (ip);
  while (n) *p++ = tmp[--n];
  if (decimals > 0) {
    *p++ = '.';
    for (int d = decimals - 1; d >= 0; d--) { long div = pow10[d]; *p++ = '0' + (fp / div) % 10; }
  }
  return p;
}

void sendSerial(uint32_t ms) {
  if (!Serial) return;                // niente USB collegato: non perdere tempo
  char line[128];
  char* p = line;
  *p++ = 'D'; *p++ = ',';
  p = putFixed(p, (float)ms, 0);  *p++ = ',';
  p = putFixed(p, ax, 3); *p++ = ','; p = putFixed(p, ay, 3); *p++ = ','; p = putFixed(p, az, 3); *p++ = ',';
  p = putFixed(p, gx, 1); *p++ = ','; p = putFixed(p, gy, 1); *p++ = ','; p = putFixed(p, gz, 1); *p++ = ',';
  p = putFixed(p, q.w, 4); *p++ = ','; p = putFixed(p, q.x, 4); *p++ = ',';
  p = putFixed(p, q.y, 4); *p++ = ','; p = putFixed(p, q.z, 4);
  *p++ = '\n';
  Serial.write((const uint8_t*)line, p - line);
}

static inline int16_t clamp16(float v) {
  if (v > 32767.0f) return 32767;
  if (v < -32767.0f) return -32767;
  return (int16_t)lroundf(v);
}

// pacchetto BLE (20 byte, int16 little-endian):
//   [0..3]  quaternione w,x,y,z  × 32767
//   [4..6]  accelerazione x,y,z  in milli-g
//   [7..9]  giroscopio x,y,z     in decimi di °/s
void sendBle() {
  if (!bleOk || !BLE.connected() || !dataChar.subscribed()) return;
  int16_t v[10] = {
    clamp16(q.w * 32767.0f), clamp16(q.x * 32767.0f), clamp16(q.y * 32767.0f), clamp16(q.z * 32767.0f),
    clamp16(ax * 1000.0f), clamp16(ay * 1000.0f), clamp16(az * 1000.0f),
    clamp16(gx * 10.0f), clamp16(gy * 10.0f), clamp16(gz * 10.0f)
  };
  uint8_t pkt[20];
  for (int i = 0; i < 10; i++) { pkt[2 * i] = v[i] & 0xFF; pkt[2 * i + 1] = (v[i] >> 8) & 0xFF; }
  dataChar.writeValue(pkt, 20, false);
}

void handleCommand(char c) {
  if (c == 'c') calibrateGyro();
  else if (c == 'r') levelFromAccel();
  else if (c == 'v' && Serial) { Serial.print("# firmware "); Serial.println(FW_VERSION); }
  else if (c == 'u') {
    if (Serial) Serial.println("# riavvio nel bootloader OTA: aggiorna con nRF Connect");
    delay(100);
    dapo_ota::enterBootloaderOta();
  }
}

// ---------------- setup / loop ----------------
void setup() {
  pinMode(LEDR, OUTPUT); pinMode(LEDG, OUTPUT); pinMode(LEDB, OUTPUT);
  setLed(false, false, false);

  Serial.begin(115200);
  uint32_t t0 = millis();
  while (!Serial && millis() - t0 < 1500) { }   // aspetta un attimo l'USB, poi parte comunque

  imu.settings.accelRange      = 16;
  imu.settings.accelSampleRate = 416;
  imu.settings.accelBandWidth  = 100;
  imu.settings.gyroRange       = 2000;
  imu.settings.gyroSampleRate  = 416;
  imu.settings.tempEnabled     = 0;
  imu.settings.accelFifoEnabled = 0;
  imu.settings.gyroFifoEnabled  = 0;

  if (imu.begin() != 0) {
    // IMU non trovata: lampeggia rosso per sempre (stai usando la XIAO *Sense* e il core mbed?)
    while (true) {
      setLed(true, false, false); delay(150);
      setLed(false, false, false); delay(150);
      if (Serial) Serial.println("# ERRORE: IMU non trovata");
    }
  }
  // Block Data Update: alto e basso di ogni campione arrivano sempre dallo stesso istante
  uint8_t c3;
  imu.readRegister(&c3, LSM6DS3_ACC_GYRO_CTRL3_C);
  imu.writeRegister(LSM6DS3_ACC_GYRO_CTRL3_C, c3 | 0x40 | 0x04);

  delay(100);
  calibrateGyro();

  if (BLE.begin()) {
    BLE.setLocalName(BLE_NAME);
    BLE.setDeviceName(BLE_NAME);
    BLE.setConnectionInterval(6, 12);          // 7.5–15 ms, se il PC lo concede
    imuService.addCharacteristic(dataChar);
    imuService.addCharacteristic(cmdChar);
    imuService.addCharacteristic(infoChar);
    BLE.addService(imuService);
    dapo_ota::begin();
    BLE.addService(dapo_ota::service);
    {
      char info[96];
      snprintf(info, sizeof info, "{\"fw\":\"%s\",\"ota\":%lu,\"board\":\"xiao-nrf52840-sense\"}",
               FW_VERSION, (unsigned long)dapo_ota::maxImageSize());
      infoChar.writeValue((const uint8_t*)info, strlen(info));
    }
    BLE.setAdvertisedService(imuService);
    BLE.advertise();
    bleOk = true;
    if (Serial) Serial.println("# BLE pronto: cerca \"DapoIMU\"");
  } else if (Serial) {
    Serial.println("# BLE non partito, continuo solo con USB");
  }

  if (Serial) { Serial.print("# DapoIMU "); Serial.println(FW_VERSION); }
  if (Serial) Serial.println("# formato: D,ms,ax,ay,az,gx,gy,gz,qw,qx,qy,qz  (g, gradi/s, quaternione)");
  tImu = tSerial = tBle = micros();
}

void loop() {
  uint32_t now = micros();

  if (now - tImu >= IMU_PERIOD_US) {
    float dt = (now - tImu) * 1e-6f;
    tImu = now;
    if (dt > 0.05f) dt = 0.05f;                // dopo una pausa lunga non esagerare
    float rax, ray, raz, rgx, rgy, rgz;
    if (readImuRaw(rax, ray, raz, rgx, rgy, rgz)) {
      ax = rax; ay = ray; az = raz;
      gx = rgx - biasX; gy = rgy - biasY; gz = rgz - biasZ;
      trackBias(rgx, rgy, rgz, millis());
      updateFusion(dt);
    }
  }

  if (now - tSerial >= SERIAL_PERIOD_US) { tSerial = now; sendSerial(millis()); }

  if (bleOk) {
    BLE.poll();
    dapo_ota::poll();
    // durante un aggiornamento il Bluetooth serve tutto al firmware nuovo
    if (now - tBle >= BLE_PERIOD_US) { tBle = now; if (!dapo_ota::busy()) sendBle(); }
    if (cmdChar.written() && cmdChar.valueLength() > 0) handleCommand((char)cmdChar.value()[0]);
  }

  while (Serial && Serial.available()) handleCommand((char)Serial.read());

  // LED di stato
  uint32_t ms = millis();
  if (bleOk && dapo_ota::busy()) setLed((ms / 120) % 2, false, (ms / 120) % 2);   // viola lampeggiante: aggiornamento
  else if (bleOk && BLE.connected()) setLed(false, false, true);
  else if (ms - tLed > 1000) { tLed = ms; setLed(false, true, false); }
  else if (ms - tLed > 60)   setLed(false, false, false);
}
