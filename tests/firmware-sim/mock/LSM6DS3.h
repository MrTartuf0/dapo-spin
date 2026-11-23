#pragma once
#include <stdint.h>
#define I2C_MODE 0
typedef int status_t;
#define IMU_SUCCESS 0
#define LSM6DS3_ACC_GYRO_OUTX_L_G 0x22
#define LSM6DS3_ACC_GYRO_CTRL3_C 0x12
struct SensorSettings { uint16_t accelRange, accelSampleRate, accelBandWidth, gyroRange, gyroSampleRate; uint8_t tempEnabled, accelFifoEnabled, gyroFifoEnabled; };
// fornito dal test: dati veri in g e dps
void simImu(float& ax,float& ay,float& az,float& gx,float& gy,float& gz);
class LSM6DS3 { public:
  SensorSettings settings;
  LSM6DS3(int,int){}
  status_t begin(){ return 0; }
  status_t readRegister(uint8_t* v, uint8_t){ *v = 0x04; return 0; }
  status_t writeRegister(uint8_t, uint8_t v){ lastCtrl3 = v; return 0; }
  uint8_t lastCtrl3 = 0;
  status_t readRegisterRegion(uint8_t* b, uint8_t off, uint8_t len){
    if(off!=0x22||len!=12) return 1;
    float ax,ay,az,gx,gy,gz; simImu(ax,ay,az,gx,gy,gz);
    float vals[6]={gx/0.07f,gy/0.07f,gz/0.07f,ax/0.000488f,ay/0.000488f,az/0.000488f};
    for(int i=0;i<6;i++){ float f=vals[i]; if(f>32767)f=32767; if(f<-32768)f=-32768; int16_t r=(int16_t)lroundf(f); b[2*i]=r&0xFF; b[2*i+1]=(r>>8)&0xFF; }
    return 0; }
  float calcGyro(int16_t r){ return (float)r*4.375f*16/1000; }
  float calcAccel(int16_t r){ return (float)r*0.061f*(16>>1)/1000; }
};
