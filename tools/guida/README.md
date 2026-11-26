# Guida di costruzione: figure e PDF

Il testo sta in [`docs/costruzione/guida-costruzione.md`](../../docs/costruzione/guida-costruzione.md).
Questa cartella genera le figure SVG e il PDF (copertina, testo, cartamodello 1:1 su quattro fogli A4).

```bash
cd tools/guida
npm install
npm run build        # figure.mjs (SVG in docs/costruzione/img) + build.mjs (PDF)
```

Serve Chrome o Chromium: se non è in un percorso standard, impostalo con `CHROME_PATH=/percorso/chrome`.

- `geometria.mjs`: la stella (due quadrati ruotati di 45°), margine di cucitura, misure. `node geometria.mjs` stampa i numeri.
- `figure.mjs`: schema a blocchi, schema elettrico, centro della dapo, raggio, cartamodello, cucitura, strati, POV.
- `build.mjs`: Markdown → HTML → PDF con Chrome headless; lo schema elettrico va su una pagina intera ruotata.
