#pragma once
#include <stdint.h>
#include <vector>
#define BLERead 1
#define BLENotify 2
#define BLEWrite 4
#define BLEWriteWithoutResponse 8
struct BLECharacteristic { const char* u; std::vector<std::vector<uint8_t>> sent; uint8_t val[4]={0}; int vlen=0; bool w=false;
  BLECharacteristic(const char* uu,int,int,bool=false):u(uu){}
  int writeValue(const uint8_t* v,int n,bool=true){ sent.emplace_back(v,v+n); return 1; }
  bool subscribed(){ return true; } bool written(){ bool r=w; w=false; return r; }
  int valueLength(){ return vlen; } const uint8_t* value(){ return val; } };
struct BLEService { BLEService(const char*){} void addCharacteristic(BLECharacteristic&){} };
struct MockBLE { bool begin(){return true;} void setLocalName(const char*){} void setDeviceName(const char*){}
  void setConnectionInterval(int,int){} void addService(BLEService&){} void setAdvertisedService(BLEService&){}
  int advertise(){return 1;} bool connected(){return true;} void poll(){} };
extern MockBLE BLE;
