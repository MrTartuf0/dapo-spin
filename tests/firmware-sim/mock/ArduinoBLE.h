#pragma once
// finta ArduinoBLE: quanto basta per DapoIMU.ino e DapoOTA.cpp
#include <stdint.h>
#include <string.h>
#include <vector>
#define BLERead 1
#define BLENotify 2
#define BLEWrite 4
#define BLEWriteWithoutResponse 8
enum BLECharacteristicEvent { BLESubscribed, BLEUnsubscribed, BLEReadEvent, BLEWritten };
struct BLEDevice {};
struct BLECharacteristic;
typedef void (*BLECharacteristicEventHandler)(BLEDevice, BLECharacteristic);
struct BLECharacteristic {
  const char* u;
  std::vector<std::vector<uint8_t>>* sent;          // notifiche inviate (condivise tra le copie)
  uint8_t val[96] = {0}; int vlen = 0; bool w = false;
  BLECharacteristicEventHandler onWrite = nullptr;
  BLECharacteristic(const char* uu, int, int, bool = false) : u(uu), sent(new std::vector<std::vector<uint8_t>>) {}
  int writeValue(const uint8_t* v, int n, bool = true) { sent->emplace_back(v, v + n); return 1; }
  bool subscribed() { return true; }
  bool written() { bool r = w; w = false; return r; }
  int valueLength() { return vlen; }
  const uint8_t* value() { return val; }
  void setEventHandler(BLECharacteristicEvent e, BLECharacteristicEventHandler h) { if (e == BLEWritten) onWrite = h; }
  // usata dai test: il "telefono" scrive sulla caratteristica
  void centralWrite(const uint8_t* v, int n) {
    memcpy(val, v, n); vlen = n; w = true;
    if (onWrite) onWrite(BLEDevice{}, *this);
  }
};
struct BLEService { BLEService(const char*) {} void addCharacteristic(BLECharacteristic&) {} };
struct MockBLE {
  bool begin() { return true; } void setLocalName(const char*) {} void setDeviceName(const char*) {}
  void setConnectionInterval(int, int) {} void addService(BLEService&) {} void setAdvertisedService(BLEService&) {}
  int advertise() { return 1; } bool connected() { return true; } void poll() {}
};
extern MockBLE BLE;
