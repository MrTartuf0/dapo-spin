# Formato dei dati e comandi

Riferimento comune tra `firmware/DapoIMU` e `tools/dapo-lab`. Se cambi uno dei due, aggiorna questo file
e il test in `tests/firmware-sim`.

## Assi e unità
- Assi: quelli dell'IMU sulla scheda. Scheda appoggiata a faccia in su → `az ≈ +1 g`.
- Accelerazione in **g**, velocità angolare in **°/s**, quaternione `(w, x, y, z)` che porta dal riferimento
  della scheda a quello del mondo (Z del mondo verso l'alto).
- Nel Dapo Lab la faccia **A** è il lato +Z della scheda.

## USB seriale (115200 baud)
Una riga ogni 10 ms (100 Hz):

```
D,<ms>,<ax>,<ay>,<az>,<gx>,<gy>,<gz>,<qw>,<qx>,<qy>,<qz>
D,3990,0.003,0.342,0.940,0.1,-0.2,0.0,0.9848,0.1736,0.0000,0.0000
```

Le righe che iniziano con `#` sono messaggi (calibrazione, errori, stato del Bluetooth).
Il firmware scrive solo se il terminale ha DTR attivo (Arduino IDE, Dapo Lab).

## Bluetooth LE
Nome: `DapoIMU`

| | UUID | Proprietà |
|---|---|---|
| Servizio | `a7f3c100-5d2e-4f8b-9e61-3c0d7b2a9e10` | |
| Dati | `a7f3c101-5d2e-4f8b-9e61-3c0d7b2a9e10` | read, notify (50 Hz) |
| Comandi | `a7f3c102-5d2e-4f8b-9e61-3c0d7b2a9e10` | write, write without response |
| Info | `a7f3c103-5d2e-4f8b-9e61-3c0d7b2a9e10` | read: `{"fw":"v0.2.0","ota":405504,"board":"xiao-nrf52840-sense"}` |

Pacchetto dati: 20 byte = 10 × `int16` little-endian (entra nell'MTU minimo di 23 byte).

| Byte | Campo | Scala |
|---|---|---|
| 0–7 | qw, qx, qy, qz | ÷ 32767 |
| 8–13 | ax, ay, az | milli-g (÷ 1000 → g) |
| 14–19 | gx, gy, gz | decimi di °/s (÷ 10 → °/s) |

## Comandi
Un carattere, via seriale o sulla caratteristica Comandi:

| Carattere | Effetto |
|---|---|
| `c` | ricalibra il bias del giroscopio (tenere ferma ~1 s) |
| `r` | livella: orientamento dalla sola gravità, yaw = 0 |
| `v` | scrive la versione del firmware (solo seriale) |
| `u` | riavvia nel bootloader in modalità OTA, per aggiornare dal telefono con nRF Connect |

## Dataset (CSV dal Dapo Lab)

```
session,label,t_s,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,qw,qx,qy,qz
```

- `session`: numero progressivo di registrazione (una sessione = un'etichetta, tempo continuo)
- `label`: etichetta scelta (es. `ferma`, `spin`, `wobble`, `lancio`, `flip`, `presa`)
- `t_s`: secondi dall'inizio del dataset, campioni ridistribuiti in modo uniforme

## Aggiornamento via Bluetooth (OTA)

Servizio separato, perché quello del bootloader (Nordic Legacy DFU) è bloccato da Chrome.
Implementazione: `firmware/DapoIMU/DapoOTA.cpp` (scheda) e `composables/useDapoBle.ts` (browser).

| | UUID | Proprietà |
|---|---|---|
| Servizio OTA | `a7f3c110-5d2e-4f8b-9e61-3c0d7b2a9e10` | |
| Controllo | `a7f3c111-5d2e-4f8b-9e61-3c0d7b2a9e10` | write, notify |
| Dati | `a7f3c112-5d2e-4f8b-9e61-3c0d7b2a9e10` | write without response |

L'immagine è il `.bin` dell'app (parte da 0x27000), al massimo 405 504 byte.
Tutti i numeri sono `uint32` little-endian.

| Browser → controllo | Significato | Risposta (notifica) |
|---|---|---|
| `B` dimensione crc32 | inizia: la scheda cancella lo staging (circa 10 s) | `K` 0 quando è pronta |
| `Q` | a che punto sei? | `K` offset atteso |
| `V` | controlla il CRC32 dell'immagine ricevuta | `V` ok(0/1) crc32 |
| `A` | installa e riavvia (solo dopo `V` ok) | `A`, poi la connessione cade |
| `X` | annulla | — |

Errori: `E` codice → 1 troppo grande, 2 passo fuori ordine, 3 CRC, 4 flash.

Pacchetto dati (20 byte): offset `uint32` + 16 byte dell'immagine (l'ultimo completato con `0xFF`).
La scheda scrive solo il pacchetto con l'offset che si aspetta e ignora gli altri. Il browser ne manda
32 alla volta, poi chiede `Q` e riparte dall'offset ricevuto: così i pacchetti persi vengono rimandati.

Installazione: una funzione che gira dalla RAM copia lo staging sopra l'app, mette a 0 il CRC16 nelle
impostazioni del bootloader (0xFF000, solo se era impostato da un caricamento seriale) e riavvia.
Recupero sempre possibile via USB: doppio tocco su reset e file `.uf2` sul disco `XIAO-SENSE`.
