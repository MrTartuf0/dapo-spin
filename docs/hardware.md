# Hardware, LED e tessuto

Appunti di progetto. Le scelte segnate **da decidere** hanno una issue aperta.

## La dapo di riferimento
Le dapo in commercio sono stelle a 8 punte (due quadrati sovrapposti) di circa 65–69 cm da punta a punta,
350–370 g, fatte di più strati di lycra o cotone + elastan cuciti a mano, con un cordoncino (piping) sul bordo.
Il nostro budget di peso, elettronica compresa, è quindi intorno ai 350–400 g.

## Scheda: Seeed XIAO nRF52840 Sense
- IMU **LSM6DS3TR-C** (accelerometro + giroscopio, niente magnetometro), microfono PDM, Bluetooth LE, ricarica LiPo.
- Core Arduino: **Seeed nRF52 mbed-enabled Boards** (Seeed lo consiglia per IMU e TinyML).
- Il firmware imposta **±16 g** e **±2000 °/s** a 416 Hz: con i ±2 g di default l'accelerometro satura appena la dapo gira.
  2000 °/s ≈ 5,5 giri/s; oltre, il Dapo Lab mostra un avviso.
- Senza magnetometro la rotazione attorno alla verticale (yaw) deriva lentamente: pulsante **Zero** nel Dapo Lab.

### Orientamento durante lo spin
Durante spin e lanci l'accelerometro misura centrifuga o caduta libera, non la gravità.
Il filtro (Mahony) quindi usa l'accelerometro solo quando |a| ≈ 1 g **e** la rotazione è sotto 300 °/s;
il resto del tempo integra il giroscopio in modo esatto. Il bias del giroscopio si calibra all'avvio e si
riaggiusta da solo quando la dapo è ferma. Nel test simulato (10 s a 3 giri/s, scheda a 5 cm dal centro)
l'errore d'inclinazione resta sotto 1°.

## Disposizione: LED a raggi
- **8 raggi** verso le punte, da ~7 cm a ~30 cm dal centro, 16 LED per raggio (≈ 65 LED/m) → 128 LED, ~2 m di striscia.
- Il **centro resta libero** per il dito. Scheda e batteria su un anello a ~5 cm, **da parti opposte** per il bilanciamento.
- I raggi sono dritti: le strisce devono piegarsi solo fuori dal piano (lo fanno bene). In un canale cucito,
  fissate solo dal lato del centro, così possono scorrere quando la lycra si allunga.
- **8 raggi o 4?** Per le immagini POV ogni raggio ridisegna l'immagine: a 3 giri/s, 8 raggi = 24 passaggi al secondo
  per punto, 4 raggi = 12 (sfarfalla). Per effetti di solo colore bastano 4.

### Tipo di LED — da decidere
| | APA102 / SK9822 | WS2812 / SK6812 |
|---|---|---|
| Fili dati | dati + clock | solo dati |
| Velocità di aggiornamento | molto alta | ~30 µs per LED (128 LED ≈ 3,8 ms → ~260 fps) |
| PWM | veloce: niente scie tratteggiate | lento: a luminosità media le punte (5–6 m/s) lasciano tratteggi |
| Adatti al POV | ✅ | ⚠️ al limite |

### Una faccia o due — da decidere
Le strisce fanno luce da un lato solo. Opzioni: due strisce schiena contro schiena (doppio peso/consumo),
4 raggi per faccia (POV più debole), oppure una sola faccia principale.

## Elettrica
- LED alimentati **direttamente dalla LiPo**, non dal 3,3 V della XIAO.
- 128 LED al massimo del bianco ≈ 8 A: **limite di luminosità nel firmware** (obiettivo 1,5–2 A di picco).
- Dati: con APA102 servono 2 pin per catena → 4 catene da 2 raggi = 8 pin (la XIAO ne ha 11), oppure raggi in serie
  con due fili sottili di ritorno. Con WS2812 a 3,3 V di segnale valutare un level shifter (es. 74AHCT125).
- Le saldature sull'anello sono il punto debole: fissare i cavi, termorestringente, imbottitura al centro.

## Tessuto
- **Lycra/elastan** come le dapo vere (stesso comportamento in rotazione), in **colore chiaro e opaco** sopra i LED:
  bianco, panna, pastello. Stampata o scura blocca la luce. Prova rapida: torcia del telefono dietro al tessuto.
- Conta più la **distanza LED–tessuto** che il tipo di stoffa: 2 strati esterni + un velo di ovatta o rete
  distanziatrice 3D in mezzo, invece di 4 strati di lycra. Tiene i LED staccati e attutisce le prese.
- Il **ripstop di nylon bianco** diffonde bene anche a contatto, ma non è elastico: cambierebbe il feeling.

## Prima di saldare
Prototipo meccanico: cucire strisce finte della stessa larghezza in una dapo vecchia e verificare che
si apra, giri e si lanci come prima. Le strisce fanno da "stecche d'ombrello".
