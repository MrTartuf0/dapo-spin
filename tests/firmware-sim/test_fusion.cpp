// Test del firmware sul computer, senza scheda.
// Compila DapoIMU.ino con finti Arduino/IMU/BLE (cartella mock/) e gli fa "vivere"
// una sessione simulata: ferma, inclinazione a 20°, 10 s di spin a 3 giri/s con la
// scheda a 5 cm dal centro (centrifuga ~1,8 g), poi di nuovo ferma.
// Controlla che l'orientamento stimato segua quello vero e che i dati in uscita
// (seriale e BLE) abbiano il formato atteso.
//
//   g++ -std=c++17 -O2 -Imock test_fusion.cpp -o test_fusion && ./test_fusion

#include "Arduino.h"
#include "ArduinoBLE.h"
#include <random>
#include <sstream>
uint64_t g_simUs = 0;
MockSerial Serial;
MockBLE BLE;
#include "../../firmware/DapoIMU/DapoIMU.ino"

struct Qd { double w, x, y, z; };
static Qd qmul(Qd a, Qd b) {
  return {a.w*b.w - a.x*b.x - a.y*b.y - a.z*b.z, a.w*b.x + a.x*b.w + a.y*b.z - a.z*b.y,
          a.w*b.y - a.x*b.z + a.y*b.w + a.z*b.x, a.w*b.z + a.x*b.y - a.y*b.x + a.z*b.w};
}
static Qd axisAngle(double ux, double uy, double uz, double ang) { double s = sin(ang / 2); return {cos(ang / 2), ux*s, uy*s, uz*s}; }
static void upInBody(Qd q, double& x, double& y, double& z) { x = 2*(q.x*q.z - q.w*q.y); y = 2*(q.y*q.z + q.w*q.x); z = 1 - 2*(q.x*q.x + q.y*q.y); }

const double D2R = M_PI / 180, TILT = 20 * D2R, OMEGA = 3 * 2 * M_PI, R_OFF = 0.05;
const double TRUE_BIAS[3] = {1.7, -0.9, 0.6};           // bias "vero" del giroscopio, °/s
const double T_SPIN0 = 4, T_SPIN1 = 14, T_END = 18;
std::mt19937 rng(1);
std::normal_distribution<double> gyroNoise(0, 0.08), accNoise(0, 0.004);

// movimento vero: q (corpo→mondo), velocità angolare nel corpo (°/s), forza specifica (g)
static void truth(double t, Qd& q, double w[3], double a[3]) {
  double rx = 0;
  w[0] = w[1] = w[2] = 0;
  if (t < 3) q = {1, 0, 0, 0};
  else if (t < 4) { q = axisAngle(1, 0, 0, TILT * (t - 3)); w[0] = TILT / D2R; }
  else if (t < T_SPIN1) { q = qmul(axisAngle(1, 0, 0, TILT), axisAngle(0, 0, 1, OMEGA * (t - T_SPIN0))); w[2] = OMEGA / D2R; rx = R_OFF; }
  else q = qmul(axisAngle(1, 0, 0, TILT), axisAngle(0, 0, 1, OMEGA * (T_SPIN1 - T_SPIN0)));
  double ux, uy, uz; upInBody(q, ux, uy, uz);
  double wr = w[2] * D2R;
  a[0] = ux - wr * wr * rx / 9.81; a[1] = uy; a[2] = uz;
}

// chiamata dal finto LSM6DS3
void simImu(float& ax, float& ay, float& az, float& gx, float& gy, float& gz) {
  Qd q; double w[3], a[3]; truth(g_simUs * 1e-6, q, w, a);
  gx = w[0] + TRUE_BIAS[0] + gyroNoise(rng); gy = w[1] + TRUE_BIAS[1] + gyroNoise(rng); gz = w[2] + TRUE_BIAS[2] + gyroNoise(rng);
  ax = a[0] + accNoise(rng); ay = a[1] + accNoise(rng); az = a[2] + accNoise(rng);
}

static double tiltErrorDeg() {
  Qd qt; double w[3], a[3]; truth(g_simUs * 1e-6, qt, w, a);
  double x1, y1, z1, x2, y2, z2; upInBody(qt, x1, y1, z1); upInBody({q.w, q.x, q.y, q.z}, x2, y2, z2);
  double d = x1*x2 + y1*y2 + z1*z2; if (d > 1) d = 1;
  return acos(d) / D2R;
}

static int failures = 0;
static void check(bool ok, const char* what, double value) {
  printf("%s %-52s %8.3f\n", ok ? "OK  " : "FAIL", what, value);
  if (!ok) failures++;
}

int main() {
  setup();
  double biasErr = fabs(biasX - TRUE_BIAS[0]) + fabs(biasY - TRUE_BIAS[1]) + fabs(biasZ - TRUE_BIAS[2]);
  check(biasErr < 0.15, "bias giroscopio stimato (errore totale, °/s)", biasErr);
  check((imu.lastCtrl3 & 0x40) != 0, "Block Data Update attivo (CTRL3_C)", imu.lastCtrl3);

  double maxSpinErr = 0, nextSample = 0;
  while (g_simUs < T_END * 1e6) {
    loop();
    g_simUs += 150;                                 // ~150 µs per giro di loop()
    double t = g_simUs * 1e-6;
    if (t >= nextSample) {
      nextSample = t + 0.05;
      if (t > T_SPIN0 && t < T_SPIN1) maxSpinErr = fmax(maxSpinErr, tiltErrorDeg());
    }
  }
  check(maxSpinErr < 2.0, "errore inclinazione massimo durante lo spin (°)", maxSpinErr);
  check(tiltErrorDeg() < 0.3, "errore inclinazione 4 s dopo lo stop (°)", tiltErrorDeg());

  std::istringstream ss(Serial.out); std::string line; int nData = 0, bad = 0;
  while (std::getline(ss, line)) {
    if (line.rfind("D,", 0) == 0) { nData++; int c = 0; for (char ch : line) c += (ch == ','); if (c != 11) bad++; }
    else if (line.rfind("#", 0) != 0) bad++;
  }
  check(nData > 1600 && bad == 0, "righe seriali ben formate (numero)", nData);
  bool bleOkLen = !dataChar.sent.empty();
  for (auto& p : dataChar.sent) if (p.size() != 20) bleOkLen = false;
  check(bleOkLen && dataChar.sent.size() > 800, "pacchetti BLE da 20 byte (numero)", (double)dataChar.sent.size());

  Serial.in = "r"; loop();
  check(tiltErrorDeg() < 1.0, "comando 'r' (livella) (errore °)", tiltErrorDeg());

  printf(failures ? "\n%d controlli falliti\n" : "\nTutto ok\n", failures);
  return failures ? 1 : 0;
}
