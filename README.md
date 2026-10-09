# Dapo Spin

Simulatore Nuxt 3 del dapo (⌀ 67 cm, ~400 g): carica i design dei due lati e guarda flick, lancio, atterraggio sulle dita e spin.

## Come si usa
- **Click sul dapo / Spazio / "Flick + lancio"**: rotazione di polso + lancio in alto, ricade per gravità sulla mano.
- **Shift+click / "Solo flick"**: rilancia lo spin tenendolo in mano.
- **P / "Pinch verticale"**: la stella gira come una ruota nel piano verticale, sempre con la stessa faccia esposta. La mano pinza un punto del tessuto a metà raggio (non il centro né i bordi) mentre gira e lo tiene fermo: la stella continua per inerzia attorno alla pinza (il centro oscilla attorno alla mano) mentre la torsione cresce e la frena — senza fermarla: poco prima dell'arresto viene lanciata con un arco basso all'altra mano, che pinza al volo e rifà lo stesso, avanti e indietro finché non lo spegni. Solo animazione (torsione + ammucchiamento attorno alla pinza nel vertex shader).
- **B / "Boomerang"**: dalla posizione sul dito, il dapo parte verso sinistra girando in orizzontale, si allontana e rientra da destra lungo un'ellisse (inclinandosi nella curva come un vero boomerang) e torna sul dito.
- **F / "Gira lato"**: mostra l'altro design.
- Pannello *Impostazioni fisica*: spin dato dal flick (giri/s), altezza lancio (cm), attrito delle dita, stabilizzazione giroscopica.

## Design
Qualsiasi immagine (SVG, PNG, JPG, WebP…) viene rasterizzata nel browser a 1024 px e ritagliata dalla forma del dapo (due quadrati a 45°). I design sono salvati in IndexedDB. Il design di default è `public/designs/spider.png`.

## Modello fisico (unità SI)
- Momento d'inerzia `I ≈ 0.45·m·r²`; flick = impulso angolare concentrato nello scatto finale del polso, con nutazione iniziale che lo spin smorza (effetto giroscopico, nutazione a ≈2ω come per un disco sottile).
- Lancio con `v = √(2gh)`, g = 9.81; l'atterraggio fa cedere il tessuto sulle dita e ruba ~10 % dello spin.
- Resistenza dell'aria allo spin (quadratica + lineare) e coppia d'attrito costante delle dita in mano.
- Tessuto appoggiato su un dito (zona di contatto 2,5 cm): da fermo drappeggia a cono con pieghe, si distende in volo o oltre ~115 rpm; all'atterraggio cede e poi si riassesta.
- Giro di dito (D): il dito orbita (raggio e velocità regolabili) e trascina lo spin per attrito (`dω/dt = k(Ω−ω)`); il centro del tessuto quasi non si sposta, è il cono di drappeggio a seguire il dito. Senza giro di dito lo spin cala per attrito del dito e aria.

## Rendering / prestazioni
WebGL puro (nessuna libreria): una mesh 40×40 (3200 triangoli) deformata nel vertex shader — drappeggio continuo attorno al punto d'appoggio, pieghe radiali, distensione centrifuga. Il ritaglio a stella e l'antialiasing del bordo sono nel fragment shader (distanza firmata), il retro usa la seconda texture. Due texture raster da 1024 px con mipmap: gira anche su telefoni modesti.

## Editor della cornice
Caricando un'immagine si apre l'editor: trascina per spostare, rotella/slider per zoom, slider per rotazione, "Riempi" / "Tutta dentro". "Applica" rasterizza un PNG 1024×1024 ritagliato a stella.

## Avvio
```bash
npm install
npm run dev        # http://localhost:3000
npm run generate   # build statica in .output/public
```
