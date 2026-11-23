# ✦ Dapo Twin

La dapo (la stella di stoffa a 8 punte che si fa girare sul dito) e il suo gemello digitale.
Carichi un design, lo guardi girare nel simulatore con flick, lanci e trick; poi prendi la **dapo vera**,
con dentro una Seeed XIAO nRF52840 Sense, e sono i tuoi movimenti reali a muovere il design sullo schermo.
In arrivo: LED cuciti a raggi che reagiscono al movimento e un modello TinyML che riconosce i trick.

## Le parti

| Parte | Dove | Stato |
|---|---|---|
| **Simulatore**: design fronte/retro, fisica di flick, lancio, pinch, boomerang | radice (Nuxt 3) | ✅ |
| **Firmware IMU**: orientamento, invio dati via USB e Bluetooth | `firmware/DapoIMU` | ✅ compila e passa il test simulato · ⏳ da provare sulla scheda |
| **Dapo Lab**: 3D dal vivo, grafici, registrazione dataset, anteprima LED | `tools/dapo-lab` | ✅ funziona con la Demo e con i dati del firmware simulato |
| **Dapo vero nel simulatore**: il design mosso dai dati reali, dal vivo o da registrazione | radice | ⏳ prossimo passo |
| **LED reattivi** e **TinyML** | `firmware/`, `data/` | ⏳ |

Il lavoro da fare è nelle [issue](../../issues).

## Struttura

```
pages/ components/ composables/   simulatore Nuxt (WebGL puro)
public/designs/                   design di default
firmware/DapoIMU/                 sketch Arduino per la XIAO (IMU, filtro di orientamento, USB + BLE)
tools/dapo-lab/                   strumento per la scheda: dapo-lab.html pronto da aprire + sorgenti
tests/firmware-sim/               test del firmware sul computer, con sensori simulati
docs/                             hardware, LED, tessuto, formato dei dati
data/                             dataset registrati con il Dapo Lab
```

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

LED della scheda: rosso = calibrazione, verde lampeggiante = in attesa, blu = Bluetooth connesso.

### Dapo Lab
Apri `tools/dapo-lab/dapo-lab.html` con **Chrome o Edge** su computer e premi **USB** o **Bluetooth**
(la scheda si chiama `DapoIMU`); **Demo** funziona anche senza scheda. Se il Bluetooth non parte con il
file aperto dal disco: `cd tools/dapo-lab && python3 -m http.server` e apri `http://localhost:8000/dapo-lab.html`.

## Sviluppo

```bash
# test del firmware con sensori simulati (spin a 3 giri/s, centrifuga, rumore, bias)
cd tests/firmware-sim && g++ -std=c++17 -O2 -Imock test_fusion.cpp -o test_fusion && ./test_fusion

# dopo aver modificato tools/dapo-lab/src/ ricostruisci la pagina
cd tools/dapo-lab && npm install && npm run build
```

La CI (GitHub Actions) su ogni pull request e su `main` fa la build del simulatore, compila il firmware
per la XIAO, esegue il test simulato e controlla che `dapo-lab.html` sia aggiornato.

## Documentazione
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
