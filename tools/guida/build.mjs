// Costruisce il PDF della guida: copertina + testo (da Markdown) + cartamodello 1:1 su A4.
// Uso: node build.mjs        (serve Chrome o Chromium; percorso in CHROME_PATH se non è standard)
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Marked } from 'marked'
import puppeteer from 'puppeteer-core'
import { PDFDocument } from 'pdf-lib'
import { starGeometry } from './geometria.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS = join(HERE, '../../docs/costruzione')
const MD = join(DOCS, 'guida-costruzione.md')
const OUT = join(DOCS, 'dapo-twin-guida-costruzione.pdf')
const VERSIONE = '0.1'
const DATA = '26 novembre 2026'

const chrome = process.env.CHROME_PATH || [
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => existsSync(p))
if (!chrome) throw new Error('Chrome non trovato: imposta CHROME_PATH')

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------------------------------------------------------------------------
// Markdown → HTML
let md = readFileSync(MD, 'utf8')
md = md.replace(/^# .*\n+\*\*Versione[^\n]*\n+/, '') // titolo e versione stanno in copertina
const toc = []
const marked = new Marked({ gfm: true })
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const id = slug(text)
      if (depth === 2) toc.push({ id, text })
      return `<h${depth} id="${id}">${text}</h${depth}>\n`
    },
    paragraph({ tokens }) {
      if (tokens.length === 1 && tokens[0].type === 'image') {
        const t = tokens[0]
        if (/fig-schema/.test(t.href)) // schema largo: pagina intera, ruotato
          return `<figure class="ruota"><div class="ruota-in"><img src="${esc(t.href)}" alt="${esc(t.text)}"><figcaption>${esc(t.text)}</figcaption></div></figure>\n`
        return `<figure><img src="${esc(t.href)}" alt="${esc(t.text)}"><figcaption>${esc(t.text)}</figcaption></figure>\n`
      }
      const html = this.parser.parseInline(tokens)
      const plain = tokens.map((t) => t.raw).join('').trim()
      return plain.endsWith(':') ? `<p class="lead">${html}</p>\n` : `<p>${html}</p>\n`
    },
    table(token) {
      const head = token.header.map((c) => `<th>${this.parser.parseInline(c.tokens)}</th>`).join('')
      const rows = token.rows.map((r) => `<tr>${r.map((c) => `<td>${this.parser.parseInline(c.tokens)}</td>`).join('')}</tr>`).join('\n')
      const cls = token.header.length >= 6 ? ' class="wide"' : ''
      return `<table${cls}><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>\n`
    },
  },
})
const body = marked.parse(md)

// ---------------------------------------------------------------------------
// Copertina con una stella stilizzata
function coverStar() {
  const g = starGeometry(67, 0)
  const s = 4.2, c = 160
  const pts = g.stitch.map(([x, y]) => `${(c + s * x).toFixed(1)},${(c - s * y).toFixed(1)}`).join(' ')
  let dots = ''
  for (let k = 0; k < 8; k++) {
    for (let i = 0; i < 16; i++) {
      const r = 5.6 + i * 1.667, a = (k * 45) * Math.PI / 180
      const hue = (k * 45 + i * 9) % 360
      dots += `<circle cx="${(c + s * r * Math.cos(a)).toFixed(1)}" cy="${(c - s * r * Math.sin(a)).toFixed(1)}" r="${(2.2 + i * 0.12).toFixed(2)}" fill="hsl(${hue},80%,60%)"/>`
    }
  }
  return `<svg viewBox="0 0 320 320" width="120mm" height="120mm" xmlns="http://www.w3.org/2000/svg">
    <defs><radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#2a1f5c"/><stop offset="1" stop-color="#120d2a"/></radialGradient></defs>
    <polygon points="${pts}" fill="url(#glow)" stroke="#8e74e8" stroke-width="2"/>
    ${dots}
    <circle cx="${c}" cy="${c}" r="${(3.3 * s).toFixed(1)}" fill="#120d2a" stroke="#e0a040" stroke-width="1.2" stroke-dasharray="3 3"/>
  </svg>`
}

const css = `
@page { size: A4; margin: 17mm 16mm 18mm 16mm; }
html { font-family: 'Fira Sans', 'DejaVu Sans', Arial, sans-serif; font-size: 11pt; color: #1d2433; }
body { margin: 0; line-height: 1.45; }
h1 { font-size: 22pt; margin: 0 0 10pt; }
h2 { font-size: 16pt; margin: 0 0 9pt; color: #3b2a85; break-before: page; }
h3 { font-size: 12.5pt; margin: 14pt 0 6pt; color: #2b2150; break-after: avoid; }
h2 + p, h3 + p { margin-top: 0; }
p { margin: 0 0 7pt; }
ul, ol { margin: 0 0 8pt; padding-left: 17pt; }
li { margin: 2pt 0; }
strong { font-weight: 600; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; line-height: 1.32; margin: 6pt 0 11pt; }
table.wide { font-size: 8.6pt; }
th, td { border-bottom: 0.6pt solid #d7dbe3; padding: 3.5pt 4.5pt; vertical-align: top; text-align: left; }
th { background: #f1effa; font-weight: 600; }
tr { break-inside: avoid; }
thead { display: table-header-group; }
figure { margin: 6pt 0 12pt; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 200mm; }
figcaption { font-size: 9pt; color: #5b6474; margin-top: 3pt; }
blockquote { margin: 8pt 0 12pt; padding: 8pt 11pt; background: #fff6e8; border-left: 3pt solid #e07b00; break-inside: avoid; }
blockquote p { margin: 0; }
code { font-family: 'DejaVu Sans Mono', monospace; font-size: 8.8pt; background: #f4f6fa; padding: 0 2pt; border-radius: 2pt; }
a { color: #2f5fc4; text-decoration: none; word-break: break-all; }
#appendice-c-fonti ~ ul { font-size: 8.6pt; line-height: 1.3; }
#appendice-c-fonti ~ ul li { margin: 0.5pt 0; }
#appendice-c-fonti ~ h3, #appendice-c-fonti ~ p.lead { margin-top: 8pt; }
#appendice-d-cartamodello-1-1 { break-before: auto; margin-top: 16pt; }
.intro { break-after: page; }
.toc h2 { break-before: avoid; margin-top: 14pt; }
.toc ul { column-count: 2; column-gap: 10mm; padding-left: 0; list-style: none; }
.toc li { margin: 3pt 0; }
p.lead { break-after: avoid; }
figure.ruota { break-before: page; break-after: page; position: relative; height: 252mm; margin: 0; }
figure.ruota .ruota-in { position: absolute; width: 248mm; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-90deg); }
figure.ruota img { width: 248mm; max-width: none; max-height: none; }
`

const coverHtml = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 0; }
html, body { margin: 0; font-family: 'Fira Sans', 'DejaVu Sans', Arial, sans-serif; }
.page { width: 210mm; height: 297mm; box-sizing: border-box; padding: 22mm 20mm; background: #0e0a22; color: #f4f1ff;
  display: flex; flex-direction: column; justify-content: space-between; }
.kicker { font-size: 11pt; letter-spacing: 0.2em; text-transform: uppercase; color: #b9a8ff; }
h1 { font-size: 40pt; margin: 6mm 0 2mm; font-weight: 700; }
.sub { font-size: 17pt; color: #d9d0ff; margin: 0; }
.art { display: flex; justify-content: center; }
.meta { font-size: 11pt; color: #b9b2d9; line-height: 1.6; }
.meta b { color: #fff; font-weight: 600; }
</style></head><body><div class="page">
<div><div class="kicker">Dapo Twin · ricerca e sviluppo</div><h1>Guida di costruzione<br>e analisi</h1>
<p class="sub">Elettronica, saldature, cucito da zero, materiali, costi e vendita<br>di una dapo con LED reattivi e immagini POV</p></div>
<div class="art">${coverStar()}</div>
<div class="meta"><b>Versione ${VERSIONE}</b> · ${DATA}<br>XIAO nRF52840 Sense · 256 LED su 8 raggi e 2 facce · 2 LiPo da 600 mAh<br>
Repository: github.com/MrTartuf0/dapo-twin-led · Simulatore: dapo-twin-led.netlify.app</div>
</div></body></html>`

// la prima parte (avvertenze + decisioni) e l'indice stanno all'inizio del testo
const firstH2 = body.indexOf('<h2')
const intro = body.slice(0, firstH2)
const rest = body.slice(firstH2)
const tocHtml = `<div class="toc"><h2 id="indice">Indice</h2><ul>${toc.map((t) => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')}</ul></div>`
const mainHtml = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><base href="${pathToFileURL(DOCS + '/').href}"><style>${css}</style></head>
<body><div class="intro">${intro}${tocHtml}</div>${rest}</body></html>`

// ---------------------------------------------------------------------------
// Cartamodello 1:1 su 4 fogli A4 (2 colonne × 2 righe), con sovrapposizione di 8 mm
function patternPages() {
  const g = starGeometry(67, 1)
  const SHEET = 360, TILE = 184, STEP = 176
  const toSheet = ([x, y]) => [5 + x * 10, SHEET - 6 - y * 10] // cm → mm, y verso il basso
  const path = (pts, close) => pts.map((p, i) => { const [X, Y] = toSheet(p); return `${i ? 'L' : 'M'}${X.toFixed(2)},${Y.toFixed(2)}` }).join(' ') + (close ? ' Z' : '')
  const cut = [[0, 0], ...g.quarter.cut]
  const tip = g.stitch[0], val = g.stitch[1]
  const gapA = [tip[0] + (val[0] - tip[0]) * 0.14, tip[1] + (val[1] - tip[1]) * 0.14]
  const gapB = [tip[0] + (val[0] - tip[0]) * 0.86, tip[1] + (val[1] - tip[1]) * 0.86]
  const [cx, cy] = toSheet([0, 0])
  let art = ''
  art += `<path d="${path(cut, true)}" fill="#f7f4ff" stroke="#000" stroke-width="0.5"/>`
  art += `<path d="${path(g.quarter.stitch, false)}" fill="none" stroke="#6d48c9" stroke-width="0.45" stroke-dasharray="3 2"/>`
  const [ax1, ay1] = toSheet(gapA), [ax2, ay2] = toSheet(gapB)
  art += `<line x1="${ax1}" y1="${ay1}" x2="${ax2}" y2="${ay2}" stroke="#e07b00" stroke-width="1.2" stroke-dasharray="2 2"/>`
  art += `<text x="${(ax1 + ax2) / 2 - 40}" y="${(ay1 + ay2) / 2 + 12}" font-size="4" fill="#e07b00">apertura per rivoltare (solo P1)</text>`
  const [ex] = toSheet([g.cut[0][0], 0]), [, ny] = toSheet([0, g.cut[4][1]])
  art += `<line x1="${cx}" y1="${cy}" x2="${ex + 4}" y2="${cy}" stroke="#d1453b" stroke-width="0.5" stroke-dasharray="6 3"/>`
  art += `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${ny - 4}" stroke="#d1453b" stroke-width="0.5" stroke-dasharray="6 3"/>`
  art += `<circle cx="${cx}" cy="${cy}" r="2" fill="none" stroke="#000" stroke-width="0.4"/><text x="${cx + 4}" y="${cy - 3}" font-size="4">centro</text>`
  art += `<text x="${cx + 30}" y="${cy - 4}" font-size="4" fill="#d1453b">asse: sulla piega della stoffa, o ruota qui di 90°</text>`
  for (const yy of [60, 230]) art += `<text x="${cx + 4}" y="${cy - yy}" font-size="4" fill="#d1453b" transform="rotate(-90 ${cx + 4} ${cy - yy})">asse · piega</text>`
  art += `<text x="${cx + 40}" y="${cy - 70}" font-size="7" font-weight="600">Dapo Twin · 1/4 di dapo da 67 cm</text>`
  art += `<text x="${cx + 40}" y="${cy - 61}" font-size="4.5">linea nera = taglio (margine di 1 cm compreso)</text>`
  art += `<text x="${cx + 40}" y="${cy - 54}" font-size="4.5">tratteggio viola = cucitura</text>`
  art += `<line x1="${cx + 40}" y1="${cy - 34}" x2="${cx + 120}" y2="${cy - 34}" stroke="#000" stroke-width="0.5" marker-end="url(#a)" marker-start="url(#a)"/>`
  art += `<text x="${cx + 40}" y="${cy - 38}" font-size="4">direzione in cui la lycra si allunga di più</text>`
  // quadrato di controllo nell'angolo vuoto in alto a destra
  art += `<rect x="290" y="20" width="50" height="50" fill="none" stroke="#000" stroke-width="0.4"/><text x="290" y="16" font-size="4">controllo: 5 × 5 cm</text>`
  const tiles = [['A1', 0, 0], ['A2', STEP, 0], ['B1', 0, STEP], ['B2', STEP, STEP]]
  const marks = () => {
    let m = ''
    for (const X of [STEP + 4]) for (const Y of [40, 120, 220, 320]) m += `<path d="M${X - 3},${Y} L${X + 3},${Y} M${X},${Y - 3} L${X},${Y + 3}" stroke="#000" stroke-width="0.3"/>`
    for (const Y of [STEP + 4]) for (const X of [40, 120, 220, 320]) m += `<path d="M${X - 3},${Y} L${X + 3},${Y} M${X},${Y - 3} L${X},${Y + 3}" stroke="#000" stroke-width="0.3"/>`
    return m
  }
  return tiles.map(([name, X0, Y0]) => {
    const shade = (X0 > 0 ? `<rect x="${X0}" y="${Y0}" width="8" height="${TILE}" fill="#000" opacity="0.07"/>` : '') +
      (Y0 > 0 ? `<rect x="${X0}" y="${Y0}" width="${TILE}" height="8" fill="#000" opacity="0.07"/>` : '')
    const map = tiles.map(([n, x, y]) => `<rect x="${x / 20}" y="${y / 20}" width="${TILE / 20}" height="${TILE / 20}" fill="${n === name ? '#6d48c9' : '#fff'}" stroke="#333" stroke-width="0.2" opacity="${n === name ? 0.8 : 1}"/><text x="${x / 20 + 3}" y="${y / 20 + 6}" font-size="3.4" fill="${n === name ? '#fff' : '#333'}">${n}</text>`).join('')
    let ruler = ''
    for (let i = 0; i <= 100; i += 5) ruler += `<line x1="${i}" y1="0" x2="${i}" y2="${i % 10 ? 2 : 4}" stroke="#000" stroke-width="0.25"/>` + (i % 10 ? '' : `<text x="${i}" y="8" font-size="3" text-anchor="middle">${i / 10}</text>`)
    return `<section class="pp">
      <div class="hd"><b>Cartamodello 1:1 — foglio ${name}</b> · stampa al 100% (“dimensioni effettive”), non “adatta alla pagina”</div>
      <svg class="tile" width="${TILE}mm" height="${TILE}mm" viewBox="${X0} ${Y0} ${TILE} ${TILE}" font-family="Fira Sans, DejaVu Sans, sans-serif" xmlns="http://www.w3.org/2000/svg">
        <defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>
        ${art}${shade}${marks()}
        <rect x="${X0 + 0.2}" y="${Y0 + 0.2}" width="${TILE - 0.4}" height="${TILE - 0.4}" fill="none" stroke="#999" stroke-width="0.3"/>
        <text x="${X0 + TILE - 6}" y="${Y0 + TILE - 6}" font-size="14" fill="#6d48c9" opacity="0.35" text-anchor="end" font-weight="700">${name}</text>
      </svg>
      <div class="ft">
        <svg width="40mm" height="40mm" viewBox="0 0 22 22">${map}</svg>
        <div class="txt">
          <p><b>Come si monta:</b> le fasce grigie vanno <b>sotto</b> il foglio vicino. Fai combaciare le crocette, fissa con lo scotch,
          poi ritaglia lungo la linea nera. Disposizione: A1 A2 sopra, B1 B2 sotto.</p>
          <p><b>Controllo della scala:</b> questo righello deve misurare esattamente 10 cm.</p>
          <svg width="104mm" height="10mm" viewBox="-2 0 104 10">${ruler}</svg>
        </div>
      </div>
    </section>`
  }).join('\n')
}
const patternHtml = `<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><style>
@page { size: A4; margin: 8mm; }
html, body { margin: 0; font-family: 'Fira Sans', 'DejaVu Sans', Arial, sans-serif; font-size: 9.5pt; color: #1d2433; }
.pp { height: 281mm; break-after: page; display: flex; flex-direction: column; align-items: center; }
.pp:last-child { break-after: auto; }
.hd { width: 184mm; margin: 2mm 0 4mm; }
.ft { width: 184mm; display: flex; gap: 6mm; margin-top: 6mm; align-items: flex-start; }
.ft p { margin: 0 0 2mm; }
</style></head><body>${patternPages()}</body></html>`

// ---------------------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'guida-'))
const files = { cover: join(tmp, 'copertina.html'), main: join(tmp, 'guida.html'), pattern: join(tmp, 'cartamodello.html') }
writeFileSync(files.cover, coverHtml)
writeFileSync(files.main, mainHtml)
writeFileSync(files.pattern, patternHtml)

const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--allow-file-access-from-files'] })
const page = await browser.newPage()
async function render(file, opts) {
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  return page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, ...opts })
}
const footer = `<div style="width:100%;font-family:'Fira Sans','DejaVu Sans',sans-serif;font-size:7.5pt;color:#7a8193;padding:0 16mm;display:flex;justify-content:space-between">
  <span>Dapo Twin · Guida di costruzione e analisi · v${VERSIONE}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`
const parts = [
  await render(files.cover, {}),
  await render(files.main, { displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: footer }),
  await render(files.pattern, {}),
]
await browser.close()

const out = await PDFDocument.create()
out.setTitle('Dapo Twin — Guida di costruzione e analisi')
out.setAuthor('Dapo Twin')
out.setSubject('Elettronica, saldature, cucito, materiali, costi e vendita di una dapo con LED reattivi')
out.setLanguage('it-IT')
for (const bytes of parts) {
  const doc = await PDFDocument.load(bytes)
  for (const p of await out.copyPages(doc, doc.getPageIndices())) out.addPage(p)
}
writeFileSync(OUT, await out.save())
console.log(`scritto ${OUT} (${out.getPageCount()} pagine)`)
