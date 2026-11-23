// Aggiornamento del firmware via Bluetooth (OTA), usabile dal browser.
//
// Il bootloader della XIAO ha già un aggiornamento via Bluetooth, ma Chrome blocca il suo
// servizio (Nordic Legacy DFU è nella blocklist di Web Bluetooth). Questo è un servizio nostro:
//   1. il firmware nuovo arriva in una seconda area della flash (staging)
//   2. si controlla il CRC32 dell'immagine ricevuta
//   3. una piccola funzione che gira dalla RAM copia lo staging sopra l'app e riavvia
// Se qualcosa va storto la scheda si recupera sempre via USB: doppio tocco su reset →
// compare il disco XIAO-SENSE → ci trascini il file .uf2.
//
// Mappa della flash (nRF52840, core Seeed mbed):
//   0x00000 – 0x27000  MBR + spazio SoftDevice (lasciato al bootloader)
//   0x27000 – 0x8A000  app (max 396 KB)
//   0x8A000 – 0xED000  staging per l'aggiornamento (stessa dimensione)
//   0xF4000 – …        bootloader Adafruit, impostazioni a 0xFF000
//
// Protocollo: vedi docs/protocollo-dati.md, sezione "Aggiornamento via Bluetooth".
#pragma once
#include <Arduino.h>
#include <ArduinoBLE.h>

namespace dapo_ota {

extern BLEService service;

// aggiunge le caratteristiche al servizio: chiamala prima di BLE.addService(dapo_ota::service)
void begin();
// da chiamare in ogni giro di loop(): cancellazione a fette, notifiche, applicazione
void poll();
// true mentre un aggiornamento è in corso (conviene fermare lo streaming dell'IMU)
bool busy();
// dimensione massima di un firmware che può arrivare via Bluetooth
uint32_t maxImageSize();
// riavvia nel bootloader in modalità OTA (per nRF Connect / Bluefruit Connect sul telefono)
void enterBootloaderOta();

}  // namespace dapo_ota
