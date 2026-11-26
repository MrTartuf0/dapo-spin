# ✦ Dapo Twin

[![CI](https://github.com/MrTartuf0/dapo-twin-led/actions/workflows/ci.yml/badge.svg)](https://github.com/MrTartuf0/dapo-twin-led/actions/workflows/ci.yml)
[![Sito](https://img.shields.io/badge/sito-dapo--twin--led.netlify.app-4fd1c5)](https://dapo-twin-led.netlify.app)
[![Firmware](https://img.shields.io/github/v/release/MrTartuf0/dapo-twin-led?label=firmware)](https://github.com/MrTartuf0/dapo-twin-led/releases/latest)

**Prova online: https://dapo-twin-led.netlify.app** · [Firmware](https://dapo-twin-led.netlify.app/firmware) · [Lab](https://dapo-twin-led.netlify.app/lab/) · [Release del firmware](https://github.com/MrTartuf0/dapo-twin-led/releases)

La dapo (la stella di stoffa a 8 punte che si fa girare sul dito) e il suo gemello digitale.
Carichi un design, lo guardi girare nel simulatore con flick, lanci e trick; poi prendi la **dapo vera**,
con dentro una Seeed XIAO nRF52840 Sense, e sono i tuoi movimenti reali a muovere il design sullo schermo.
In arrivo: LED cuciti a raggi che reagiscono al movimento e un modello TinyML che riconosce i trick.

## Le parti

| Parte | Dove | Stato |
|---|---|---|
| **Simulatore**: design fronte/retro, fisica di flick, lancio, pinch, boomerang | radice (Nuxt 3) | ✅ |
| **Firmware IMU**: orientamento, invio dati via USB e Bluetooth | `firmware/DapoIMU` | ✅ compila e passa il test simulato · ⏳ da provare sulla scheda |
| **Dapo Lab**: 3D dal vivo, grafici, registrazione dataset, anteprima LED | `tools/dapo-lab` → `/lab` | ✅ funziona con la Demo e con i dati del firmware simulato |
| **Aggiornamento firmware**: dal browser via Bluetooth, dal telefono, via USB | `/firmware`, `firmware/DapoIMU/DapoOTA.*` | ✅ testato in simulazione · ⏳ da provare sulla scheda |
| **Sito e release**: deploy su Netlify, binari del firmware nelle Release | `.github/workflows/ci.yml` | ✅ |
| **Provare i design**: fisica, gesture predefinite, dapo vero via Bluetooth, registrazioni CSV | `components/MotionPanel.vue`, `composables/useMotion.ts` | ✅ |
| **LED simulati sopra il design**, accesi o spenti a parte (raggi o bordo, 9 effetti) | `components/LedPanel.vue`, `utils/leds.ts` | ✅ |
| **LED reattivi** e **TinyML** | `firmware/`, `data/` | ⏳ |

Il lavoro da fare è nelle [issue](../../issues).

## Struttura

```
pages/ components/ composables/   sito Nuxt: simulatore (/) e aggiornamento firmware (/firmware)
public/designs/                   design di default
firmware/DapoIMU/                 sketch Arduino per la XIAO (IMU, filtro di orientamento, USB + BLE)
tools/dapo-lab/                   strumento per la scheda: dapo-lab.html pronto da aprire + sorgenti
tests/firmware-sim/               test del firmware sul computer, con sensori simulati
tools/guida/                      figure e PDF della guida di costruzione
docs/                             hardware, LED, tessuto, formato dei dati
docs/costruzione/                 guida di costruzione: elettronica, saldature, cucito, costi (+ PDF)
data/                             dataset registrati con il Dapo Lab
```

## Provare un design
Carica fronte e retro nella barra a sinistra, poi scegli da dove arriva il movimento:

| Movimento | Per chi | Cosa fa |
|---|---|---|
| **Fisica** | tutti | il modello fisico: flick, lancio, giro di dito, pinch verticale, boomerang |
| **Gesture** | chi non ha la scheda | movimenti predefiniti che girano da soli: spin sul dito, flick e lancio, lancio con flip, wobble, ruota verticale, oppure tutti di fila |
| **Dapo vero** | chi ha la dapo con la XIAO | i tuoi movimenti, dal vivo via Bluetooth (Chrome o Edge) |
| **Registrazione** | tutti | un CSV del Dapo Lab, rigiocato con il design attivo (play, pausa, velocità) |

I **LED** si accendono a parte, così lo stesso design si prova su una dapo con o senza luci:
disposizione a raggi o sul bordo, nove effetti, diffusione nel tessuto e modalità "al buio".
La logica degli effetti è in `utils/leds.ts`, uguale a quella del Dapo Lab.

## Il sito
Ogni push su `main` (e ogni tag) pubblica il sito su Netlify; ogni pull request ha la sua anteprima,
con il link scritto nei commenti della PR.

| Percorso | Cosa c'è |
|---|---|
| `/` | simulatore: design, fisica, trick |
| `/firmware` | aggiornare la dapo: Bluetooth dal browser, telefono (bootloader), USB |
| `/lab/` | Dapo Lab |
| `/guida/dapo-twin-guida-costruzione.pdf` | la guida di costruzione in PDF, con il cartamodello 1:1 |
| `/firmware/latest.json`, `latest.bin`, `*.uf2`, `*-dfu.zip` | il firmware costruito dallo stesso commit del sito |

### Configurare Netlify (una volta)
1. Su Netlify: **Add new site → Deploy manually**, trascina una cartella qualsiasi, poi in *Site configuration*
   rinomina il sito in `dapo-twin-led` (se il nome è preso, aggiorna i link di questo README).
2. Copia il **Site ID** (*Site configuration → General*) e crea un **Personal access token**
   (*User settings → Applications*).
3. Su GitHub: *Settings → Secrets and variables → Actions* → aggiungi `NETLIFY_SITE_ID` e `NETLIFY_AUTH_TOKEN`.
4. Su GitHub, nella pagina del repo: ⚙️ accanto ad *About* → *Website* = `https://dapo-twin-led.netlify.app`.

Senza i segreti la CI fa tutto il resto e salta solo la pubblicazione.

### Pubblicare una versione del firmware
```bash
git tag v0.2.0 && git push origin v0.2.0
```
La CI compila con la versione `v0.2.0`, crea la [Release](https://github.com/MrTartuf0/dapo-twin-led/releases)
con `.uf2` (USB), `.bin` (browser), `-dfu.zip` (telefono), `.hex` e `firmware.json`, e pubblica il sito
con quel firmware nella pagina `/firmware`.

## Avvio

### Simulatore
```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # build statica in .output/public
```

### Firmware
1. Arduino IDE → Preferenze → URL aggiuntive:
   `https://files.seeedstudio.com/arduino/package_seeeduino_boards_index.json`
2. Gestore schede: **Seeed nRF52 mbed-enabled Boards** → scheda **XIAO nRF52840 Sense**
   (nelle versioni recenti il nome finisce con "(No Updates)": è quella giusta).
3. Gestore librerie: **Seeed Arduino LSM6DS3** (non *Arduino_LSM6DS3*) e **ArduinoBLE**.
4. Carica `firmware/DapoIMU/DapoIMU.ino`. All'accensione tieni la dapo ferma ~1 s (LED rosso = calibrazione).

Senza Arduino IDE: scarica il `.uf2` dalla [Release](https://github.com/MrTartuf0/dapo-twin-led/releases/latest),
tocca due volte il reset della XIAO e trascina il file sul disco `XIAO-SENSE`. Da lì in poi si aggiorna
anche senza cavo, dalla pagina `/firmware` del sito.

LED della scheda: rosso = calibrazione, verde lampeggiante = in attesa, blu = Bluetooth connesso,
viola lampeggiante = aggiornamento in corso.

### Dapo Lab
Apri `tools/dapo-lab/dapo-lab.html` con **Chrome o Edge** su computer e premi **USB** o **Bluetooth**
(la scheda si chiama `DapoIMU`); **Demo** funziona anche senza scheda. Se il Bluetooth non parte con il
file aperto dal disco: `cd tools/dapo-lab && python3 -m http.server` e apri `http://localhost:8000/dapo-lab.html`.

## Sviluppo

```bash
# test del firmware sul PC: orientamento (spin a 3 giri/s, centrifuga, rumore, bias)
# e aggiornamento via Bluetooth (pacchetti persi, CRC, copia, impostazioni del bootloader)
make -C tests/firmware-sim

# dopo aver modificato tools/dapo-lab/src/ ricostruisci la pagina
cd tools/dapo-lab && npm install && npm run build
```

La CI (GitHub Actions, `.github/workflows/ci.yml`) su ogni pull request, su `main` e sui tag:
compila il firmware e prepara i binari, esegue i test simulati, ricostruisce il Dapo Lab, fa la build del
sito, lo pubblica su Netlify e, sui tag `v*`, crea la Release del firmware.

## Documentazione
- [Guida di costruzione e analisi](docs/costruzione/guida-costruzione.md): elettronica, saldature, cucito da zero,
  materiali, costi e vendita ([PDF con il cartamodello 1:1](docs/costruzione/dapo-twin-guida-costruzione.pdf))
- [Hardware, LED e tessuto](docs/hardware.md)
- [Formato dei dati e comandi](docs/protocollo-dati.md)

## Il simulatore nel dettaglio

Simulatore Nuxt 3 del dapo (⌀ 67 cm, ~400 g): carica i design dei due lati e guarda flick, lancio, atterraggio sulle dita e spin.

### Come si usa
- **Click sul dapo / Spazio / "Flick + lancio"**: rotazione di polso + lancio in alto, ricade per gravità sulla mano.
- **Shift+click / "Solo flick"**: rilancia lo spin tenendolo in mano.
- **P / "Pinch verticale"**: la stella gira come una ruota nel piano verticale, sempre con la stessa faccia esposta. La mano pinza un punto del tessuto a metà raggio (non il centro né i bordi) mentre gira e lo tiene fermo: la stella continua per inerzia attorno alla pinza (il centro oscilla attorno alla mano) mentre la torsione cresce e la frena — senza fermarla: poco prima dell'arresto viene lanciata con un arco basso all'altra mano, che pinza al volo e rifà lo stesso, avanti e indietro finché non lo spegni. Solo animazione (torsione + ammucchiamento attorno alla pinza nel vertex shader).
- **B / "Boomerang"**: dalla posizione sul dito, il dapo parte verso sinistra girando in orizzontale, si allontana e rientra da destra lungo un'ellisse (inclinandosi nella curva come un vero boomerang) e torna sul dito.
- **F / "Gira lato"**: mostra l'altro design.
- Pannello *Impostazioni fisica*: spin dato dal flick (giri/s), altezza lancio (cm), attrito delle dita, stabilizzazione giroscopica.

### Design
Qualsiasi immagine (SVG, PNG, JPG, WebP…) viene rasterizzata nel browser a 1024 px e ritagliata dalla forma del dapo (due quadrati a 45°). I design sono salvati in IndexedDB. Il design di default è `public/designs/spider.png`.

### Modello fisico (unità SI)
- Momento d'inerzia `I ≈ 0.45·m·r²`; flick = impulso angolare concentrato nello scatto finale del polso, con nutazione iniziale che lo spin smorza (effetto giroscopico, nutazione a ≈2ω come per un disco sottile).
- Lancio con `v = √(2gh)`, g = 9.81; l'atterraggio fa cedere il tessuto sulle dita e ruba ~10 % dello spin.
- Resistenza dell'aria allo spin (quadratica + lineare) e coppia d'attrito costante delle dita in mano.
- Tessuto appoggiato su un dito (zona di contatto 2,5 cm): da fermo drappeggia a cono con pieghe, si distende in volo o oltre ~115 rpm; all'atterraggio cede e poi si riassesta.
- Giro di dito (D): il dito orbita (raggio e velocità regolabili) e trascina lo spin per attrito (`dω/dt = k(Ω−ω)`); il centro del tessuto quasi non si sposta, è il cono di drappeggio a seguire il dito. Senza giro di dito lo spin cala per attrito del dito e aria.

### Rendering / prestazioni
WebGL puro (nessuna libreria): una mesh 40×40 (3200 triangoli) deformata nel vertex shader — drappeggio continuo attorno al punto d'appoggio, pieghe radiali, distensione centrifuga. Il ritaglio a stella e l'antialiasing del bordo sono nel fragment shader (distanza firmata), il retro usa la seconda texture. Due texture raster da 1024 px con mipmap: gira anche su telefoni modesti.

### Editor della cornice
Caricando un'immagine si apre l'editor: trascina per spostare, rotella/slider per zoom, slider per rotazione, "Riempi" / "Tutta dentro". "Applica" rasterizza un PNG 1024×1024 ritagliato a stella.
