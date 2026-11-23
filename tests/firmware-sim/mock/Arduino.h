#pragma once
#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <string>
#include <stdio.h>
extern uint64_t g_simUs;
inline uint32_t micros(){ return (uint32_t)g_simUs; }
inline uint32_t millis(){ return (uint32_t)(g_simUs/1000); }
inline void delay(uint32_t ms){ g_simUs += (uint64_t)ms*1000; }
inline void delayMicroseconds(uint32_t us){ g_simUs += us; }
#define OUTPUT 1
#define LOW 0
#define HIGH 1
#define LEDR 12
#define LEDG 13
#define LEDB 14
inline void pinMode(int,int){}
inline void digitalWrite(int,int){}
struct MockSerial {
  std::string out; std::string in;
  void begin(long){}
  explicit operator bool() const { return true; }
  void print(const char* s){ out += s; }
  void print(char c){ out += c; }
  void print(float v,int d){ char b[32]; snprintf(b,32,"%.*f",d,v); out+=b; }
  void println(const char* s){ out += s; out += '\n'; }
  void println(float v,int d){ print(v,d); out+='\n'; }
  size_t write(const uint8_t* b, size_t n){ out.append((const char*)b,n); return n; }
  int available(){ return (int)in.size(); }
  int read(){ if(in.empty()) return -1; char c=in[0]; in.erase(0,1); return c; }
};
extern MockSerial Serial;
