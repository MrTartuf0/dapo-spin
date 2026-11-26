// Genera le figure SVG della guida di costruzione in docs/costruzione/img/.
// Uso: node figure.mjs   (nessuna dipendenza esterna)
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { starGeometry } from './geometria.mjs'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../docs/costruzione/img')
mkdirSync(OUT, { recursive: true })

const FONT = "'Fira Sans', 'DejaVu Sans', Arial, sans-serif"
const C = {
  ink: '#1d2433', muted: '#5b6474', line: '#9aa3b2', faint: '#e7eaf0', bg: '#ffffff',
  red: '#d1453b', black: '#222222', yellow: '#c99700', green: '#2e9d57', blue: '#2f6fd6',
  purple: '#6d48c9', orange: '#e07b00', fill: '#f4f6fa', finger: '#fff1df', lycra: '#efe9fb',
  mesh: '#e6f4ec', batt: '#dfe9fb', pcb: '#e3f1e3', shrink: 'rgba(120,130,150,0.18)',
}
const D = Math.PI / 180
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const f = (n) => Number(n.toFixed(2))

function svg(w, h, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="${FONT}">
<title>${esc(title)}</title>
<defs>
  <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.ink}"/></marker>
  <marker id="arrR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.red}"/></marker>
  <marker id="arrB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.blue}"/></marker>
  <marker id="arrG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.green}"/></marker>
  <marker id="arrM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${C.muted}"/></marker>
</defs>
<rect width="${w}" height="${h}" fill="${C.bg}"/>
${body}
</svg>
`
}
function T(x, y, s, o = {}) {
  const { size = 13, anchor = 'start', weight = 400, fill = C.ink, italic = false, rotate = 0, family } = o
  const lines = String(s).split('\n')
  const lh = size * 1.22
  const tr = rotate ? ` transform="rotate(${rotate} ${f(x)} ${f(y)})"` : ''
  const fam = family ? ` font-family="${family}"` : ''
  return lines.map((ln, i) =>
    `<text x="${f(x)}" y="${f(y + i * lh)}" font-size="${size}" text-anchor="${anchor}" font-weight="${weight}" fill="${fill}"${italic ? ' font-style="italic"' : ''}${tr}${fam}>${esc(ln)}</text>`).join('\n')
}
const L = (x1, y1, x2, y2, o = {}) => {
  const { stroke = C.ink, w = 1.6, dash, marker, markerStart, cap = 'round', opacity } = o
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="${cap}"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}${markerStart ? ` marker-start="url(#${markerStart})"` : ''}${opacity ? ` opacity="${opacity}"` : ''}/>`
}
const P = (d, o = {}) => {
  const { stroke = C.ink, w = 1.6, fill = 'none', dash, marker, markerStart, opacity, join = 'round' } = o
  return `<path d="${d}" stroke="${stroke}" stroke-width="${w}" fill="${fill}" stroke-linejoin="${join}" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${marker ? ` marker-end="url(#${marker})"` : ''}${markerStart ? ` marker-start="url(#${markerStart})"` : ''}${opacity ? ` opacity="${opacity}"` : ''}/>`
}
const R = (x, y, w, h, o = {}) => {
  const { fill = C.fill, stroke = C.ink, sw = 1.4, rx = 6, dash, opacity, transform } = o
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity ? ` opacity="${opacity}"` : ''}${transform ? ` transform="${transform}"` : ''}/>`
}
const Ci = (cx, cy, r, o = {}) => {
  const { fill = 'none', stroke = C.ink, sw = 1.4, dash, opacity } = o
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity ? ` opacity="${opacity}"` : ''}/>`
}
const dot = (x, y, r = 3.2, fill = C.ink) => `<circle cx="${f(x)}" cy="${f(y)}" r="${r}" fill="${fill}"/>`
const poly = (pts, o = {}) => {
  const { stroke = C.ink, w = 1.6, fill = 'none', dash, close = true } = o
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${f(p[0])},${f(p[1])}`).join(' ') + (close ? ' Z' : '')
  return P(d, { stroke, w, fill, dash })
}
function box(x, y, w, h, title, sub, o = {}) {
  const { fill = C.fill, stroke = C.ink, tsize = 14, ssize = 11.5 } = o
  let s = R(x, y, w, h, { fill, stroke })
  const lines = sub ? sub.split('\n') : []
  const total = tsize * 1.25 + lines.length * ssize * 1.25
  let ty = y + h / 2 - total / 2 + tsize
  s += T(x + w / 2, ty, title, { size: tsize, anchor: 'middle', weight: 600 })
  lines.forEach((ln, i) => { s += T(x + w / 2, ty + tsize * 0.35 + (i + 1) * ssize * 1.25, ln, { size: ssize, anchor: 'middle', fill: C.muted }) })
  return s
}
function ground(x, y) { // simbolo di massa con il punto di attacco in (x, y)
  return L(x, y, x, y + 10, { w: 1.4 }) + L(x - 9, y + 10, x + 9, y + 10, { w: 1.6 }) + L(x - 6, y + 14, x + 6, y + 14, { w: 1.4 }) + L(x - 3, y + 18, x + 3, y + 18, { w: 1.2 })
}
function resistor(x1, y1, x2, y2, label, o = {}) { // resistore a zig-zag fra due punti allineati
  const { stroke = C.ink, lside = 'right' } = o
  const horiz = Math.abs(y2 - y1) < 1
  const len = horiz ? x2 - x1 : y2 - y1
  const zl = 34, a = (len - zl) / 2
  let s = ''
  if (horiz) {
    const xs = x1 + a, xe = x2 - a
    s += L(x1, y1, xs, y1, { stroke }) + L(xe, y1, x2, y1, { stroke })
    let d = `M${f(xs)},${f(y1)}`
    for (let i = 0; i < 6; i++) d += ` L${f(xs + (i + 0.5) * zl / 6)},${f(y1 + (i % 2 ? 6 : -6))}`
    d += ` L${f(xe)},${f(y1)}`
    s += P(d, { stroke, w: 1.5 })
    if (label) s += T((x1 + x2) / 2, y1 - 11, label, { size: 11.5, anchor: 'middle' })
  } else {
    const ys = y1 + a, ye = y2 - a
    s += L(x1, y1, x1, ys, { stroke }) + L(x1, ye, x1, y2, { stroke })
    let d = `M${f(x1)},${f(ys)}`
    for (let i = 0; i < 6; i++) d += ` L${f(x1 + (i % 2 ? 6 : -6))},${f(ys + (i + 0.5) * zl / 6)}`
    d += ` L${f(x1)},${f(ye)}`
    s += P(d, { stroke, w: 1.5 })
    if (label) s += T(lside === 'right' ? x1 + 11 : x1 - 11, (y1 + y2) / 2 + 4, label, { size: 11.5, anchor: lside === 'right' ? 'start' : 'end' })
  }
  return s
}
function capacitor(x, y1, y2, label, o = {}) { // condensatore verticale fra y1 (alto) e y2 (basso)
  const { polar = false, lside = 'right' } = o
  const m = (y1 + y2) / 2
  let s = L(x, y1, x, m - 4) + L(x, m + 4, x, y2)
  s += L(x - 12, m - 4, x + 12, m - 4, { w: 2.2 })
  s += polar ? P(`M${x - 12},${m + 7} Q${x},${m + 1} ${x + 12},${m + 7}`, { w: 2.2 }) : L(x - 12, m + 4, x + 12, m + 4, { w: 2.2 })
  if (polar) s += T(x - 16, m - 8, '+', { size: 11, anchor: 'middle' })
  if (label) s += T(lside === 'right' ? x + 16 : x - 16, m + 4, label, { size: 11.5, anchor: lside === 'right' ? 'start' : 'end' })
  return s
}
const pinLabel = (x, y, s, anchor = 'start', fill = C.muted) => T(x, y, s, { size: 10.5, anchor, fill })

function save(name, content) { writeFileSync(join(OUT, name), content); console.log('scritto', name) }

// ---------------------------------------------------------------------------
// 1. Schema a blocchi
function figBlocchi() {
  const W = 1000, H = 540
  let b = ''
  b += T(24, 32, 'Schema a blocchi: chi alimenta chi, chi comanda chi', { size: 17, weight: 600 })
  // batterie
  b += box(24, 70, 200, 76, 'Batteria A', 'LiPo 1S 600 mAh\ncon protezione (PCM)', { fill: C.batt })
  b += box(24, 180, 200, 76, 'Batteria B', 'uguale ad A, lato opposto\ncollegata in parallelo', { fill: C.batt })
  b += L(224, 108, 262, 108, { stroke: C.red, w: 3.5 }) + L(224, 218, 262, 218, { stroke: C.red, w: 3.5 }) + L(262, 108, 262, 218, { stroke: C.red, w: 3.5 })
  b += L(262, 163, 290, 163, { stroke: C.red, w: 3.5, marker: 'arrR' })
  b += box(292, 128, 150, 70, 'F1', 'fusibile ripristinabile\nPTC 1,5 A', { fill: '#fff' })
  b += L(442, 163, 488, 163, { stroke: C.red, w: 3.5 })
  // nodo VBAT
  b += L(488, 50, 488, 400, { stroke: C.red, w: 4 })
  b += T(474, 44, 'VBAT 3,0–4,2 V', { size: 12.5, weight: 600, fill: C.red, anchor: 'end' })
  // caricatore
  b += box(560, 30, 230, 70, 'Caricatore USB-C', 'MCP73831, ~500 mA\npresa di ricarica dell’utente', { fill: '#fff8e8' })
  b += L(560, 65, 492, 65, { stroke: C.red, w: 3, marker: 'arrR' })
  // XIAO
  b += box(560, 140, 210, 112, 'XIAO nRF52840 Sense', 'IMU · Bluetooth · firmware\nalimentata dai pad BAT+/BAT−\nVBAT dal partitore interno', { fill: C.pcb })
  b += L(492, 196, 556, 196, { stroke: C.red, w: 3, marker: 'arrR' })
  // interruttore LED
  b += box(560, 300, 210, 84, 'Interruttore LED', 'P-MOSFET AO3401A + BSS138\naccensione morbida, 0 µA da spento', { fill: '#fff' })
  b += L(492, 342, 556, 342, { stroke: C.red, w: 3.5, marker: 'arrR' })
  b += L(665, 252, 665, 296, { stroke: C.blue, w: 2, marker: 'arrB' })
  b += T(673, 280, 'D1 = LED_EN', { size: 11.5, fill: C.blue })
  // VLED
  b += L(770, 342, 860, 342, { stroke: C.red, w: 3.5 })
  b += T(814, 334, 'VLED', { size: 12.5, weight: 600, fill: C.red, anchor: 'middle' })
  b += L(860, 342, 860, 430, { stroke: C.red, w: 3.5, marker: 'arrR' })
  // traslatori
  b += box(830, 150, 140, 108, '2× SN74LV1T34', 'traslatori\nalimentati da VLED\n3,3 V → VLED', { fill: '#eef3ff' })
  b += L(860, 342, 900, 342, { stroke: C.red, w: 2.5 }) + L(900, 342, 900, 262, { stroke: C.red, w: 2.5, marker: 'arrR' })
  b += L(770, 180, 826, 180, { stroke: C.blue, w: 2, marker: 'arrB' }) + T(798, 172, 'D8 SCK', { size: 10.5, fill: C.blue, anchor: 'middle' })
  b += L(770, 230, 826, 230, { stroke: C.blue, w: 2, marker: 'arrB' }) + T(798, 222, 'D10 MOSI', { size: 10.5, fill: C.blue, anchor: 'middle' })
  b += P('M970,204 L984,204 L984,470 L966,470', { stroke: C.green, w: 2.4, marker: 'arrG' })
  b += T(976, 300, 'CLK + DATI', { size: 11.5, fill: C.green, rotate: 90, anchor: 'start' })
  // catena LED
  b += box(690, 432, 276, 82, 'Catena LED (256)', '8 raggi × 2 facce × 16 LED\nuna sola catena a zig-zag', { fill: '#fdf0f6' })
  // legenda
  const ly = 470
  b += L(30, ly, 70, ly, { stroke: C.red, w: 4 }) + T(78, ly + 4, 'potenza (VBAT, VLED)', { size: 12 })
  b += L(30, ly + 24, 70, ly + 24, { stroke: C.blue, w: 2 }) + T(78, ly + 28, 'segnali 3,3 V dalla XIAO', { size: 12 })
  b += L(30, ly + 48, 70, ly + 48, { stroke: C.green, w: 2.4 }) + T(78, ly + 52, 'segnali al livello dei LED', { size: 12 })
  b += T(300, ly + 4, 'Tutte le masse (GND) sono in comune e non sono disegnate.', { size: 12, fill: C.muted })
  b += T(300, ly + 28, 'Le batterie vanno collegate fra loro solo se hanno la stessa tensione.', { size: 12, fill: C.muted })
  return svg(W, H, b, 'Schema a blocchi')
}

// ---------------------------------------------------------------------------
// 2. Schema elettrico della scheda hub
function figSchema() {
  const W = 1180, H = 610
  let b = ''
  b += T(24, 30, 'Schema elettrico della scheda hub (prototipo v1)', { size: 17, weight: 600 })
  // connettori batteria
  const conn = (x, y, name, sub) => R(x, y, 74, 62, { fill: C.batt }) + T(x + 37, y + 22, name, { size: 13, weight: 600, anchor: 'middle' }) + T(x + 37, y + 38, sub, { size: 10, anchor: 'middle', fill: C.muted }) + pinLabel(x + 70, y + 16, '+', 'end') + pinLabel(x + 70, y + 54, '−', 'end')
  b += conn(30, 84, 'J1', 'batteria A') + conn(30, 184, 'J2', 'batteria B')
  b += L(104, 96, 150, 96) + L(104, 196, 150, 196) + L(150, 196, 150, 80) + dot(150, 96)
  b += L(104, 136, 124, 136) + ground(124, 136) + L(104, 236, 124, 236) + ground(124, 236)
  b += T(156, 128, 'VPACK', { size: 11.5, fill: C.red, weight: 600 })
  // F1
  b += L(150, 80, 172, 80) + R(172, 70, 50, 20, { fill: '#fff', rx: 3 }) + T(197, 63, 'F1 PTC 1,5 A', { size: 11.5, anchor: 'middle' }) + L(222, 80, 250, 80)
  // binario VBAT
  b += L(250, 80, 780, 80, { stroke: C.red, w: 2.6 })
  b += T(256, 70, 'VBAT', { size: 12.5, fill: C.red, weight: 600 })
  // XIAO
  b += L(290, 80, 290, 300) + dot(290, 80)
  b += R(240, 300, 200, 250, { fill: C.pcb })
  b += T(340, 400, 'XIAO', { size: 16, weight: 600, anchor: 'middle' })
  b += T(340, 419, 'nRF52840 Sense', { size: 12, anchor: 'middle', fill: C.muted })
  b += T(340, 439, 'VBAT letta su P0.31', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(250, 318, 'BAT+ (pad sotto)')
  b += pinLabel(250, 538, 'BAT− / GND')
  b += L(250, 550, 250, 566) + ground(250, 566)
  b += pinLabel(436, 369, 'D1', 'end') + pinLabel(436, 512, 'D8 · SCK', 'end') + pinLabel(436, 532, 'D10 · MOSI', 'end')
  // caricatore
  b += L(380, 80, 380, 128) + dot(380, 80)
  b += R(320, 128, 150, 70, { fill: '#fff8e8' })
  b += T(395, 152, 'U3 caricatore', { size: 12.5, weight: 600, anchor: 'middle' })
  b += T(395, 169, 'MCP73831 · USB-C', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += T(395, 185, 'R_PROG 2 kΩ = 500 mA', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(384, 141, 'BAT')
  b += L(460, 198, 460, 214) + ground(460, 214)
  // rete del gate di Q1
  b += L(560, 80, 560, 112) + dot(560, 80) + capacitor(560, 112, 152, 'C1 470 nF', { lside: 'left' }) + L(560, 152, 560, 170) + L(560, 170, 610, 170)
  b += resistor(610, 80, 610, 170, 'R1 100 kΩ') + dot(610, 80) + dot(610, 170)
  b += L(610, 170, 690, 170)
  // Q1
  b += R(690, 116, 88, 106, { fill: '#fff' })
  b += T(734, 154, 'Q1', { size: 14, weight: 600, anchor: 'middle' })
  b += T(734, 172, 'AO3401A', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += T(734, 188, 'P-MOSFET', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(694, 166, 'G') + pinLabel(738, 128, 'S', 'middle') + pinLabel(738, 216, 'D', 'middle')
  b += L(734, 80, 734, 116) + dot(734, 80)
  b += L(734, 222, 734, 262)
  // R2 e Q2
  b += resistor(610, 170, 610, 330, 'R2 10 kΩ')
  b += R(572, 330, 76, 84, { fill: '#fff' })
  b += T(610, 364, 'Q2', { size: 14, weight: 600, anchor: 'middle' })
  b += T(610, 381, 'BSS138', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(614, 344, 'D') + pinLabel(576, 369, 'G') + pinLabel(614, 410, 'S')
  b += L(610, 414, 610, 432) + ground(610, 432)
  b += L(440, 365, 572, 365, { stroke: C.blue, w: 1.8 })
  b += L(510, 365, 510, 392) + dot(510, 365) + resistor(510, 392, 510, 462, 'R3 100 kΩ', { lside: 'left' }) + ground(510, 462)
  // binario VLED
  b += L(734, 262, 1010, 262, { stroke: C.red, w: 2.6 }) + dot(734, 262)
  b += T(760, 254, 'VLED (spento = 0 V)', { size: 12.5, fill: C.red, weight: 600 })
  b += L(780, 262, 780, 290) + dot(780, 262) + capacitor(780, 290, 330, 'C2 470 µF', { polar: true }) + L(780, 330, 780, 346) + ground(780, 346)
  b += L(870, 262, 870, 290) + dot(870, 262) + capacitor(870, 290, 330, 'C3 10 µF') + L(870, 330, 870, 346) + ground(870, 346)
  // U1 + U2
  b += L(960, 262, 960, 390) + dot(960, 262)
  b += R(905, 390, 110, 150, { fill: '#eef3ff' })
  b += T(960, 452, 'U1 + U2', { size: 14, weight: 600, anchor: 'middle' })
  b += T(960, 469, '2× SN74LV1T34', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += T(960, 484, '+100 nF ciascuno', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(960, 405, 'VCC', 'middle') + pinLabel(909, 432, 'A1') + pinLabel(909, 520, 'A2') + pinLabel(1011, 432, 'Y1', 'end') + pinLabel(1011, 520, 'Y2', 'end')
  b += L(960, 540, 960, 556) + ground(960, 556)
  b += P('M440,508 L880,508 L880,428 L905,428', { stroke: C.blue, w: 1.8 })
  b += P('M440,528 L890,528 L890,516 L905,516', { stroke: C.blue, w: 1.8 })
  // uscite
  b += resistor(1015, 428, 1080, 428, 'R4 33 Ω') + resistor(1015, 516, 1080, 516, 'R5 33 Ω')
  b += L(1010, 262, 1080, 262, { stroke: C.red, w: 2.6 })
  // J4
  b += R(1080, 240, 80, 320, { fill: '#fdf0f6' })
  b += T(1120, 340, 'J4', { size: 14, weight: 600, anchor: 'middle' })
  b += T(1120, 358, 'al raggio 1', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += T(1120, 372, 'faccia A', { size: 10.5, anchor: 'middle', fill: C.muted })
  b += pinLabel(1086, 266, 'VLED') + pinLabel(1086, 432, 'CLK') + pinLabel(1086, 520, 'DATI') + pinLabel(1086, 548, 'GND')
  b += L(1080, 544, 1062, 544) + L(1062, 544, 1062, 562) + ground(1062, 562)
  b += T(24, 598, 'Q1 resta spento finché D1 non va alto: R1 e R3 tengono tutto spento anche con la XIAO in deep sleep. R2 e C1 rallentano l’accensione (~4 ms) per non far scattare la protezione delle batterie.', { size: 11.5, fill: C.muted })
  return svg(W, H, b, 'Schema elettrico della scheda hub')
}

// ---------------------------------------------------------------------------
// 3. Vista dall'alto dell'hub
function figHub() {
  const W = 840, H = 820, cx = 330, cy = 410, s = 13.4 // px per cm
  const pt = (r, a) => [cx + s * r * Math.cos(a * D), cy - s * r * Math.sin(a * D)]
  let b = ''
  b += T(24, 30, 'Centro della dapo visto dalla faccia A', { size: 17, weight: 600 })
  b += T(24, 50, 'Raggi verso le 8 punte, elettronica in 4 “valli” alternate, centro libero per il dito', { size: 12.5, fill: C.muted })
  // coperchio
  b += Ci(cx, cy, 12.8 * s, { stroke: C.purple, dash: '7 6', sw: 1.6 }) + Ci(cx, cy, 10.8 * s, { stroke: C.purple, sw: 1, opacity: 0.6 })
  for (let k = 0; k < 8; k++) { const [x, y] = pt(11.8, 22.5 + 45 * k); b += Ci(x, y, 5, { fill: '#fff', stroke: C.purple, sw: 1.6 }) }
  // zona dito
  b += Ci(cx, cy, 3.3 * s, { fill: C.finger, stroke: C.orange, sw: 1.2, dash: '4 4' })
  b += T(cx, cy - 2, 'zona dito', { size: 12, anchor: 'middle', fill: C.orange, weight: 600 })
  b += T(cx, cy + 13, 'r < 3,3 cm', { size: 11, anchor: 'middle', fill: C.orange })
  // anello di alimentazione
  b += Ci(cx, cy, 3.8 * s, { stroke: C.red, sw: 2.6 }) + Ci(cx, cy, 4.2 * s, { stroke: C.black, sw: 2.6 })
  // raggi: ordine della catena (antiorario) partendo dal raggio dopo la XIAO
  const start = 135
  const spokeAng = (k) => (start + 45 * k) % 360
  const rEnd = 20.5
  for (let k = 0; k < 8; k++) {
    const a = spokeAng(k)
    const [x1, y1] = pt(4.8, a), [x2, y2] = pt(rEnd, a)
    b += L(x1, y1, x2, y2, { stroke: '#3a3f4b', w: 8, cap: 'butt' })
    const [x3, y3] = pt(rEnd + 0.4, a), [x4, y4] = pt(rEnd + 1.6, a)
    b += L(x3, y3, x4, y4, { stroke: '#3a3f4b', w: 8, cap: 'butt', dash: '3 4' })
    for (let i = 0; i < 9; i++) { const [lx, ly] = pt(5.6 + i * 1.667, a); b += `<rect x="${f(lx - 2.6)}" y="${f(ly - 2.6)}" width="5.2" height="5.2" fill="#fff" transform="rotate(${-a} ${f(lx)} ${f(ly)})"/>` }
    const [p1x, p1y] = pt(3.8, a - 3.5), [p2x, p2y] = pt(4.9, a - 3.5)
    b += L(p1x, p1y, p2x, p2y, { stroke: C.red, w: 1.6 })
    const [g1x, g1y] = pt(4.2, a + 3.5), [g2x, g2y] = pt(4.9, a + 3.5)
    b += L(g1x, g1y, g2x, g2y, { stroke: C.black, w: 1.6 })
    const [nx, ny] = pt(rEnd + 3.2, a)
    b += Ci(nx, ny, 12, { fill: '#fff', stroke: C.ink, sw: 1.4 }) + T(nx, ny + 4.5, String(k + 1), { size: 13, weight: 700, anchor: 'middle' })
  }
  // salti dati fra un raggio e il successivo (r = 5,0 cm)
  for (let k = 0; k < 7; k++) {
    const a1 = spokeAng(k) + 4, a2 = spokeAng(k) + 41
    const [x1, y1] = pt(4.55, a1), [x2, y2] = pt(4.55, a2)
    b += P(`M${f(x1)},${f(y1)} A${4.55 * s},${4.55 * s} 0 0 0 ${f(x2)},${f(y2)}`, { stroke: C.green, w: 2.2, dash: '5 3' })
  }
  // fasci di cavi
  const arc = (r, a1, a2, o) => { const [x1, y1] = pt(r, a1), [x2, y2] = pt(r, a2); const large = Math.abs(a2 - a1) > 180 ? 1 : 0; return P(`M${f(x1)},${f(y1)} A${r * s},${r * s} 0 ${large} ${a2 > a1 ? 0 : 1} ${f(x2)},${f(y2)}`, o) }
  b += arc(10.05, 22.5, -67.5, { stroke: C.muted, w: 5, opacity: 0.5 })
  b += arc(10.05, 202.5, 292.5, { stroke: C.muted, w: 5, opacity: 0.5 })
  b += arc(10.45, 112.5, 292.5, { stroke: C.blue, w: 3.5, opacity: 0.55 })
  // elementi dell'hub nelle valli
  const item = (a, r0, len, wid, fill, title) => {
    const [x, y] = pt(r0 + len / 2, a)
    let o = `<g transform="translate(${f(x)} ${f(y)}) rotate(${-a})">`
    o += R(-len * s / 2, -wid * s / 2, len * s, wid * s, { fill, rx: 5 })
    o += '</g>'
    o += T(x, y + 4, title, { size: 10.5, weight: 600, anchor: 'middle' })
    return o
  }
  b += item(22.5, 5.6, 4.2, 3.05, C.batt, 'Batt. A')
  b += item(202.5, 5.6, 4.2, 3.05, C.batt, 'Batt. B')
  b += item(112.5, 5.9, 2.6, 2.1, C.pcb, 'XIAO')
  b += item(292.5, 5.8, 3.2, 2.6, '#fff8e8', 'Potenza')
  { const [x1, y1] = pt(5.8, 292.5), [x2, y2] = pt(4.22, 292.5); b += L(x1, y1, x2, y2, { stroke: C.red, w: 3 }) }
  { const [x1, y1] = pt(5.9, 120), [x2, y2] = pt(4.85, 131); b += L(x1, y1, x2, y2, { stroke: C.green, w: 2.6 }) }
  // legenda
  const lx = 640, ly0 = 110
  const items = [
    ['circle', C.finger, C.orange, 'zona dito: niente; fino a 5,5 cm solo fili morbidi'],
    ['line', C.red, null, 'anello VLED (24 AWG)'],
    ['line', C.black, null, 'anello GND (24 AWG)'],
    ['dash', C.green, null, 'dati: XIAO → raggio 1 e salti fra raggi (30 AWG)'],
    ['band', C.muted, null, 'cavi batterie → scheda di potenza'],
    ['band', C.blue, null, 'fascio XIAO ↔ potenza: VBAT, GND, LED_EN'],
    ['ring', '#fff', C.purple, 'apertura r = 10,8 cm, coperchio r = 12,8 cm, bottoni a r = 11,8 cm'],
    ['spoke', '#3a3f4b', null, 'raggio LED (16 LED per faccia, da 5,6 a 30,6 cm)'],
  ]
  b += T(lx, ly0 - 22, 'Legenda', { size: 14, weight: 600 })
  items.forEach(([kind, c1, c2, label], i) => {
    const y = ly0 + i * 34
    if (kind === 'circle') b += Ci(lx + 14, y, 9, { fill: c1, stroke: c2, dash: '3 3' })
    if (kind === 'line') b += L(lx, y, lx + 28, y, { stroke: c1, w: 2.6 })
    if (kind === 'dash') b += L(lx, y, lx + 28, y, { stroke: c1, w: 2.2, dash: '5 3' })
    if (kind === 'band') b += L(lx, y, lx + 28, y, { stroke: c1, w: 5, opacity: 0.55 })
    if (kind === 'ring') b += L(lx, y, lx + 28, y, { stroke: c2, w: 1.6, dash: '7 6' }) + Ci(lx + 14, y, 5, { fill: '#fff', stroke: c2, sw: 1.6 })
    if (kind === 'spoke') b += L(lx, y, lx + 28, y, { stroke: c1, w: 8, cap: 'butt' }) + `<rect x="${lx + 11}" y="${y - 2.6}" width="5.2" height="5.2" fill="#fff"/>`
    const words = label.split(' '); let line = '', lines = []
    for (const w of words) { if ((line + ' ' + w).trim().length > 26) { lines.push(line.trim()); line = w } else line += ' ' + w }
    lines.push(line.trim())
    b += T(lx + 38, y + 4 - (lines.length - 1) * 7, lines.join('\n'), { size: 11.5 })
  })
  b += T(24, 752, 'I numeri sono l’ordine della catena, in senso antiorario visto dalla faccia A. Ogni raggio: 16 LED sulla faccia A in uscita,', { size: 12, fill: C.muted })
  b += T(24, 770, 'giro in punta, 16 LED sulla faccia B in rientro. Il raggio 8 finisce accanto alla XIAO: comodo per un filo di autotest (facoltativo).', { size: 12, fill: C.muted })
  b += T(24, 788, 'Batterie (12 g) una di fronte all’altra; XIAO e scheda di potenza (3–5 g) una di fronte all’altra: il baricentro resta al centro.', { size: 12, fill: C.muted })
  return svg(W, H, b, 'Centro della dapo: disposizione hub')
}

// ---------------------------------------------------------------------------
// 4. Dettaglio di un raggio
function figRaggio() {
  const W = 1000, H = 500
  let b = ''
  b += T(24, 30, 'Un raggio a doppia faccia: saldature e protezioni (non in scala)', { size: 17, weight: 600 })
  const x0 = 240, x1 = 740, yA = 150, yB = 172
  b += R(x0, yA - 6, x1 - x0, 10, { fill: '#2b2f38', stroke: '#2b2f38', rx: 1.5 })
  b += R(x0, yB - 4, x1 - x0, 10, { fill: '#2b2f38', stroke: '#2b2f38', rx: 1.5 })
  b += R(x0, yA + 4, x1 - x0, yB - yA - 8, { fill: '#f2d5a0', stroke: 'none', rx: 0 })
  for (let i = 0; i < 16; i++) {
    const x = x0 + 22 + i * (x1 - x0 - 44) / 15
    b += R(x - 6, yA - 13, 12, 7, { fill: '#fff', stroke: C.ink, sw: 1, rx: 1.5 })
    b += R(x - 6, yB + 6, 12, 7, { fill: '#fff', stroke: C.ink, sw: 1, rx: 1.5 })
  }
  b += T((x0 + x1) / 2, yA - 24, 'striscia faccia A: 16 LED verso l’alto, dati dal centro verso la punta →', { size: 12, anchor: 'middle' })
  b += T((x0 + x1) / 2, yB + 36, '← striscia faccia B: 16 LED verso il basso, dati dalla punta verso il centro', { size: 12, anchor: 'middle' })
  b += T((x0 + x1) / 2, yB + 54, 'in mezzo: il biadesivo delle due strisce, schiena contro schiena', { size: 11, anchor: 'middle', fill: C.muted })
  // termorestringente agli estremi
  b += R(x0 - 6, yA - 22, 70, yB - yA + 46, { fill: C.shrink, stroke: C.line, sw: 1, rx: 6 })
  b += R(x1 - 64, yA - 22, 70, yB - yA + 46, { fill: C.shrink, stroke: C.line, sw: 1, rx: 6 })
  // lato centro: fili che arrivano a ventaglio
  const top = [[C.red, 'VLED'], [C.yellow, 'CLK in'], [C.green, 'DATI in'], [C.black, 'GND']]
  const bot = [[C.red, 'VLED'], [C.yellow, 'CLK out'], [C.green, 'DATI out'], [C.black, 'GND']]
  top.forEach(([c, l], i) => { const y = 92 + i * 15; b += P(`M80,${y} L160,${y} L${x0},${yA - 4 + i * 2.6}`, { stroke: c, w: 2.4 }) + T(76, y + 4, l, { size: 11, anchor: 'end', fill: c }) })
  bot.forEach(([c, l], i) => { const y = 196 + i * 15; b += P(`M80,${y} L160,${y} L${x0},${yB - 2 + i * 2.6}`, { stroke: c, w: 2.4, dash: i === 1 || i === 2 ? '5 3' : undefined }) + T(76, y + 4, l, { size: 11, anchor: 'end', fill: c }) })
  b += T(110, 78, 'ingresso faccia A', { size: 11.5, anchor: 'middle', weight: 600 })
  b += T(110, 266, 'uscita faccia B', { size: 11.5, anchor: 'middle', weight: 600 }) + T(110, 281, '→ raggio successivo', { size: 11, anchor: 'middle', fill: C.muted })
  // goccia di colla
  b += `<ellipse cx="${x0 + 30}" cy="${yA - 1}" rx="16" ry="7" fill="rgba(120,180,255,0.35)" stroke="${C.blue}" stroke-width="1"/>`
  b += `<ellipse cx="${x0 + 30}" cy="${yB + 3}" rx="16" ry="7" fill="rgba(120,180,255,0.35)" stroke="${C.blue}" stroke-width="1"/>`
  b += T(x0 + 30, yA - 34, 'colla flessibile', { size: 10.5, anchor: 'middle', fill: C.blue })
  // punta: inversione a U con 4 fili
  const cols = [C.red, C.yellow, C.green, C.black]
  cols.forEach((c, i) => {
    const r = 12 + i * 5
    b += P(`M${x1},${yA - 4 + i * 2} C${x1 + r * 2},${yA - 10 - i * 3} ${x1 + r * 2},${yB + 10 + i * 3} ${x1},${yB + 2 - i * 2}`, { stroke: c, w: 2 })
  })
  b += T(x1 + 64, 136, 'giro in punta', { size: 11.5, weight: 600 })
  b += T(x1 + 64, 151, 'uscita A → ingresso B', { size: 11, fill: C.muted })
  b += T(x1 + 64, 165, '4 fili 30 AWG, ~15 mm', { size: 11, fill: C.muted })
  b += T(x1 + 64, 179, 'VLED, CLK, DATI, GND', { size: 11, fill: C.muted })
  b += T(x0 + 4, yB + 76, 'termorestringente trasparente sulle due estremità', { size: 10.5, fill: C.muted })
  // quote
  b += L(x0, 300, x1, 300, { stroke: C.muted, w: 1, marker: 'arrM', markerStart: 'arrM' })
  b += T((x0 + x1) / 2, 318, '16 LED × 16,7 mm = 26,7 cm per faccia (striscia da r ≈ 4,8 a 31,4 cm)', { size: 12, anchor: 'middle' })
  b += L(945, 70, 945, 280, { stroke: C.purple, w: 1.6, dash: '6 5' })
  b += T(938, 74, 'cucitura del bordo', { size: 11, fill: C.purple, anchor: 'end' }) + T(938, 88, '(r = 33,5 cm)', { size: 11, fill: C.purple, anchor: 'end' })
  b += L(x1 + 8, 280, 943, 280, { stroke: C.purple, w: 1, marker: 'arrM', markerStart: 'arrM' })
  b += T((x1 + 945) / 2, 272, '≈ 2 cm liberi', { size: 11, anchor: 'middle', fill: C.purple })
  // piazzole
  const py = 368
  b += T(24, py - 14, 'Piazzole al lato centro (vista dall’alto, ingrandite)', { size: 14, weight: 600 })
  const pads = (x, title, names, dashed) => {
    const colors = [C.red, C.yellow, C.green, C.black]
    let o = R(x, py, 230, 104, { fill: '#2b2f38', stroke: '#2b2f38', rx: 4 })
    o += T(x + 115, py + 124, title, { size: 12, anchor: 'middle', weight: 600 })
    names.forEach((n, i) => {
      const yy = py + 12 + i * 23
      o += R(x + 150, yy, 62, 16, { fill: '#d9b25c', stroke: '#a9852f', sw: 1, rx: 2 })
      o += T(x + 181, yy + 12, n, { size: 10.5, anchor: 'middle', weight: 600 })
      o += L(x - 110, yy + 8, x + 168, yy + 8, { stroke: colors[i], w: 3, dash: dashed && (i === 1 || i === 2) ? '6 4' : undefined })
    })
    o += R(x + 20, py + 36, 30, 30, { fill: '#fff', stroke: C.ink, sw: 1, rx: 2 }) + T(x + 35, py + 82, 'LED 2020', { size: 10, anchor: 'middle', fill: '#cfd3dc' })
    return o
  }
  b += pads(140, 'faccia A: ingresso (5V, CI, DI, GND)', ['5V', 'CI', 'DI', 'GND'], false)
  b += pads(700, 'faccia B: uscita (5V, CO, DO, GND)', ['5V', 'CO', 'DO', 'GND'], true)
  b += T(485, py + 34, 'L’ordine delle piazzole cambia', { size: 11.5, anchor: 'middle', fill: C.muted })
  b += T(485, py + 50, 'da un produttore all’altro:', { size: 11.5, anchor: 'middle', fill: C.muted })
  b += T(485, py + 66, 'leggi sempre le scritte', { size: 11.5, anchor: 'middle', fill: C.muted })
  b += T(485, py + 82, 'stampate sulla striscia.', { size: 11.5, anchor: 'middle', fill: C.muted })
  return svg(W, H, b, 'Dettaglio di un raggio')
}

// ---------------------------------------------------------------------------
// 5. Cartamodello
function figCartamodello() {
  const g = starGeometry(67, 1)
  const W = 860, H = 900, cx = 400, cy = 430, s = 10.5
  const tr = ([x, y]) => [cx + s * x, cy - s * y]
  let b = ''
  b += T(24, 30, 'Cartamodello: due quadrati ruotati di 45°', { size: 17, weight: 600 })
  b += T(24, 50, 'Misure della linea di cucitura per una dapo da 67 cm; il taglio è 1 cm più fuori', { size: 12.5, fill: C.muted })
  b += Ci(cx, cy, g.R * s, { stroke: C.line, sw: 1, dash: '3 5' })
  b += poly(g.squareA.map(tr), { stroke: C.line, w: 1.2, dash: '8 6' })
  b += poly(g.squareB.map(tr), { stroke: C.line, w: 1.2, dash: '8 6' })
  b += poly(g.cut.map(tr), { stroke: C.ink, w: 1.6 })
  b += poly(g.stitch.map(tr), { stroke: C.purple, w: 2.6 })
  for (let k = 0; k < 8; k++) { const [x, y] = tr(g.stitch[2 * k]); b += dot(x, y, 4, C.purple) }
  b += L(cx - 10, cy, cx + 10, cy, { w: 1.4 }) + L(cx, cy - 10, cx, cy + 10, { w: 1.4 })
  b += T(cx + 8, cy + 22, 'centro', { size: 11, fill: C.muted })
  // apertura per rivoltare
  const tip = g.stitch[0], val = g.stitch[1]
  const pa = [tip[0] + (val[0] - tip[0]) * 0.14, tip[1] + (val[1] - tip[1]) * 0.14]
  const pb = [tip[0] + (val[0] - tip[0]) * 0.86, tip[1] + (val[1] - tip[1]) * 0.86]
  const [ax, ay] = tr(pa), [bx, by] = tr(pb)
  b += L(ax, ay, bx, by, { stroke: '#fff', w: 6 }) + L(ax, ay, bx, by, { stroke: C.orange, w: 2.6, dash: '4 4' })
  b += L(ax - 7, ay - 7, ax + 7, ay + 7, { stroke: C.orange, w: 2 }) + L(bx - 7, by - 7, bx + 7, by + 7, { stroke: C.orange, w: 2 })
  b += T(690, 200, 'apertura per rivoltare', { size: 12, fill: C.orange, weight: 600 }) + T(690, 215, '(non cucire qui: ~10 cm)', { size: 11, fill: C.orange })
  b += L(720, 222, (ax + bx) / 2 + 8, (ay + by) / 2 - 6, { stroke: C.orange, w: 1, marker: 'arrM' })
  // quote: diametro sotto
  const [t0x] = tr([g.R, 0]), [t4x] = tr([-g.R, 0])
  const yd = cy + g.R * s + 34
  b += L(t4x, yd, t0x, yd, { stroke: C.muted, w: 1, marker: 'arrM', markerStart: 'arrM' })
  b += L(t4x, cy + 8, t4x, yd + 6, { stroke: C.line, w: 0.8, dash: '3 3' }) + L(t0x, cy + 8, t0x, yd + 6, { stroke: C.line, w: 0.8, dash: '3 3' })
  b += T(cx, yd + 20, `da punta a punta ${g.D} cm (raggio delle punte ${g.R.toFixed(1).replace('.', ',')} cm)`, { size: 12.5, anchor: 'middle' })
  // lato del quadrato: sopra il quadrato dritto
  const [q1x, q1y] = tr([-g.a, g.a]), [q2x] = tr([g.a, g.a])
  b += L(q1x, q1y - 26, q2x, q1y - 26, { stroke: C.muted, w: 1, marker: 'arrM', markerStart: 'arrM' })
  b += T(q1x + 6, q1y - 32, `lato del quadrato ${(2 * g.a).toFixed(1).replace('.', ',')} cm`, { size: 12, fill: C.muted })
  // raggio della valle
  const [vx, vy] = tr(g.stitch[3])
  b += L(cx, cy, vx, vy, { stroke: C.green, w: 1.2, marker: 'arrG' })
  b += T(cx + (vx - cx) * 0.55 - 8, cy + (vy - cy) * 0.55, `valle r = ${g.rv.toFixed(1).replace('.', ',')} cm`, { size: 12, fill: C.green, anchor: 'end' })
  // lato punta-valle
  const [e1x, e1y] = tr(g.stitch[9]), [e2x, e2y] = tr(g.stitch[10])
  b += T((e1x + e2x) / 2 - 12, (e1y + e2y) / 2 + 18, `lato ${g.edge.toFixed(1).replace('.', ',')} cm`, { size: 12, anchor: 'end', fill: C.purple })
  // legenda
  const ly = 878
  b += T(24, ly - 26, `Area finita ${g.area.toFixed(3).replace('.', ',')} m² · perimetro ${g.perimeter.toFixed(2).replace('.', ',')} m · ogni strato si taglia da un quadrato di ${Math.ceil(g.cutSize)}×${Math.ceil(g.cutSize)} cm`, { size: 12, fill: C.muted })
  b += L(24, ly, 64, ly, { stroke: C.purple, w: 2.6 }) + T(70, ly + 4, 'linea di cucitura', { size: 12 })
  b += L(220, ly, 260, ly, { stroke: C.ink, w: 1.6 }) + T(266, ly + 4, 'linea di taglio (+1 cm)', { size: 12 })
  b += L(450, ly, 490, ly, { stroke: C.line, w: 1.2, dash: '8 6' }) + T(496, ly + 4, 'costruzione: i due quadrati', { size: 12 })
  return svg(W, H, b, 'Cartamodello della dapo')
}

// ---------------------------------------------------------------------------
// 6. Passi di cucitura
function figCucitura() {
  const W = 1000, H = 700
  let b = ''
  b += T(24, 30, 'Le quattro mosse della cucitura “a sacco”', { size: 17, weight: 600 })
  const panel = (x, y, n, title) => R(x, y, 470, 300, { fill: '#fbfbfd', stroke: C.faint, rx: 10 }) + Ci(x + 26, y + 26, 14, { fill: C.purple, stroke: 'none' }) + T(x + 26, y + 31, String(n), { size: 14, weight: 700, anchor: 'middle', fill: '#fff' }) + T(x + 48, y + 31, title, { size: 14.5, weight: 600 })
  const g = starGeometry(67, 1)
  // 1: strati + mollette
  b += panel(20, 50, 1, 'Dritto contro dritto, mollette, segna l’apertura')
  {
    const cx = 245, cy = 204, s = 3.2, tr = ([x, y]) => [cx + s * x, cy - s * y]
    b += poly(g.stitch.map(tr), { stroke: C.purple, w: 2, fill: C.lycra })
    for (let k = 0; k < 16; k++) { const [x, y] = tr(g.stitch[k]); b += R(x - 4, y - 7, 8, 14, { fill: C.orange, stroke: 'none', rx: 2, transform: `rotate(${-(k * 22.5)} ${f(x)} ${f(y)})` }) }
    const t = g.stitch[0], v = g.stitch[1], pa = tr([t[0] + (v[0] - t[0]) * 0.2, t[1] + (v[1] - t[1]) * 0.2]), pb = tr([t[0] + (v[0] - t[0]) * 0.8, t[1] + (v[1] - t[1]) * 0.8])
    b += L(pa[0] - 8, pa[1] - 4, pa[0] + 8, pa[1] + 4, { stroke: C.red, w: 3 }) + L(pb[0] - 8, pb[1] - 4, pb[0] + 8, pb[1] + 4, { stroke: C.red, w: 3 })
    b += T(380, 120, 'segni rossi =', { size: 11.5, fill: C.red }) + T(380, 134, 'inizio e fine', { size: 11.5, fill: C.red }) + T(380, 148, 'dell’apertura', { size: 11.5, fill: C.red })
    b += T(40, 336, 'Una molletta su ogni punta e ogni valle, poi una o due per lato.', { size: 11.5, fill: C.muted })
  }
  // 2: cucitura con perni
  b += panel(510, 50, 2, 'Cuci a 1 cm dal bordo, gira sugli angoli')
  {
    const ox = 560, oy = 120
    b += P(`M${ox},${oy + 180} L${ox + 150},${oy + 30} L${ox + 300},${oy + 180}`, { stroke: C.ink, w: 1.4, fill: C.lycra })
    b += P(`M${ox + 30},${oy + 180} L${ox + 150},${oy + 60} L${ox + 270},${oy + 180}`, { stroke: C.purple, w: 2.2, dash: '7 5' })
    b += dot(ox + 150, oy + 60, 5, C.red)
    b += T(ox + 182, oy + 50, 'ago giù → alza il piedino', { size: 11.5, fill: C.red }) + T(ox + 182, oy + 64, '→ ruota la stoffa → riabbassa', { size: 11.5, fill: C.red })
    b += T(ox + 20, oy + 205, 'Punta: ruota di 90°. Valle: ruota di 45° nell’altro verso.', { size: 11.5, fill: C.muted })
    b += T(ox + 20, oy + 222, 'Punto zigzag stretto (largh. 0,8–1 mm, lungh. 2,5).', { size: 11.5, fill: C.muted })
  }
  // 3: rifilare e incidere
  b += panel(20, 370, 3, 'Taglia le punte, incidi le valli')
  {
    const ox = 60, oy = 430
    b += P(`M${ox},${oy + 190} L${ox + 120},${oy + 30} L${ox + 240},${oy + 190}`, { stroke: C.ink, w: 1.4, fill: C.lycra })
    b += P(`M${ox + 26},${oy + 190} L${ox + 120},${oy + 62} L${ox + 214},${oy + 190}`, { stroke: C.purple, w: 2.2 })
    b += P(`M${ox + 95},${oy + 64} L${ox + 145},${oy + 64}`, { stroke: C.red, w: 2.6 })
    b += T(ox + 155, oy + 60, 'taglia via la punta', { size: 11.5, fill: C.red }) + T(ox + 155, oy + 74, 'a 2–3 mm dalla cucitura', { size: 11.5, fill: C.red })
    const vx = 320, vy = 450
    b += P(`M${vx},${vy} L${vx + 60},${vy + 90} L${vx + 140},${vy + 40}`, { stroke: C.ink, w: 1.4 })
    b += P(`M${vx - 6},${vy + 30} L${vx + 58},${vy + 122} L${vx + 140},${vy + 72}`, { stroke: C.purple, w: 2.2 })
    b += L(vx + 60, vy + 90, vx + 59, vy + 116, { stroke: C.red, w: 2.6 })
    b += T(vx - 10, vy + 160, 'incidi fino a 2 mm', { size: 11.5, fill: C.red }) + T(vx - 10, vy + 174, 'dalla cucitura, non oltre', { size: 11.5, fill: C.red })
  }
  // 4: rivoltare e impunturare
  b += panel(510, 370, 4, 'Rivolta, spingi le punte, impuntura il bordo')
  {
    const cx = 745, cy = 522, s = 3.0, tr = ([x, y]) => [cx + s * x, cy - s * y]
    const inner = starGeometry(67, -0.45).cut
    b += poly(g.stitch.map(tr), { stroke: C.ink, w: 1.6, fill: C.lycra })
    b += poly(inner.map(tr), { stroke: C.purple, w: 1.8, dash: '5 4' })
    b += T(530, 656, 'Impuntura a 4–5 mm dal bordo: chiude l’apertura e tiene piatto il bordo.', { size: 11.5, fill: C.muted })
  }
  return svg(W, H, b, 'Passi di cucitura')
}

// ---------------------------------------------------------------------------
// 7. Sezione degli strati
function figStrati() {
  const W = 1000, H = 490
  let b = ''
  b += T(24, 30, 'Sezione della dapo LED (esplosa, spessori esagerati)', { size: 17, weight: 600 })
  const x0 = 40, x1 = 800
  const layer = (y, h, fill, label, sub, o = {}) => R(o.x ?? x0, y, (o.x1 ?? x1) - (o.x ?? x0), h, { fill, stroke: C.line, sw: 1, rx: 3 }) + T(x1 + 12, y + h / 2 + 2, label, { size: 12, weight: 600 }) + (sub ? T(x1 + 12, y + h / 2 + 16, sub, { size: 10.5, fill: C.muted }) : '')
  b += T(x0, 62, '← centro (dito)', { size: 11.5, fill: C.orange }) + T(x1, 62, 'bordo →', { size: 11.5, anchor: 'end', fill: C.muted })
  b += layer(80, 14, C.lycra, 'Faccia A', 'lycra chiara 180–220 g/m²')
  b += layer(112, 22, '#f7f7f7', 'Diffusore', 'ovatta 2–3 mm o rete 3D', { x1: x1 - 40 })
  b += layer(152, 10, C.mesh, 'Anima', 'power mesh bianca')
  // canali e raggi
  for (const cxp of [260, 520]) {
    b += P(`M${cxp - 26},${158} Q${cxp},${128} ${cxp + 26},${158}`, { stroke: C.purple, w: 2, fill: 'rgba(109,72,201,0.08)' })
    b += P(`M${cxp - 26},${158} Q${cxp},${188} ${cxp + 26},${158}`, { stroke: C.purple, w: 2, fill: 'rgba(109,72,201,0.08)' })
    b += R(cxp - 13, 151, 26, 12, { fill: '#2b2f38', stroke: 'none', rx: 2 })
    b += R(cxp - 5, 145, 10, 5, { fill: '#fff', stroke: C.ink, sw: 1, rx: 1 }) + R(cxp - 5, 164, 10, 5, { fill: '#fff', stroke: C.ink, sw: 1, rx: 1 })
    b += P(`M${cxp - 3},${143} L${cxp - 14},${120} M${cxp + 3},${143} L${cxp + 14},${120}`, { stroke: C.yellow, w: 1.2, dash: '3 3' })
    b += P(`M${cxp - 3},${171} L${cxp - 14},${196} M${cxp + 3},${171} L${cxp + 14},${196}`, { stroke: C.yellow, w: 1.2, dash: '3 3' })
  }
  b += T(400, 212, 'canale = nastro cucito sull’anima con due cuciture a 8–9 mm; dentro scorre il raggio a doppia faccia', { size: 11.5, anchor: 'middle', fill: C.purple })
  b += layer(228, 22, '#f7f7f7', 'Diffusore', 'come sopra', { x1: x1 - 40 })
  // faccia B con coperchio
  b += R(x0 + 230, 268, x1 - x0 - 230, 14, { fill: C.lycra, stroke: C.line, sw: 1, rx: 3 }) + T(x1 + 12, 278, 'Faccia B', { size: 12, weight: 600 }) + T(x1 + 12, 292, 'lycra, con apertura', { size: 10.5, fill: C.muted }) + T(x1 + 12, 306, 'centrale', { size: 10.5, fill: C.muted })
  b += R(x0, 290, 270, 14, { fill: '#e3dcf6', stroke: C.purple, sw: 1.2, rx: 3 })
  b += T(x0 + 4, 324, 'coperchio centrale (doppio strato) sovrapposto 2 cm, chiuso da bottoni a pressione', { size: 11.5, fill: C.purple })
  b += Ci(x0 + 248, 283, 5, { fill: '#fff', stroke: C.purple, sw: 1.6 })
  // tasca e batteria
  b += R(x0 + 70, 254, 110, 12, { fill: C.batt, stroke: C.ink, sw: 1, rx: 2 })
  b += T(x0 + 125, 246, 'batteria nella sua tasca', { size: 10.5, anchor: 'middle', fill: C.muted })
  // cucitura del bordo
  b += L(x1 - 8, 72, x1 - 8, 312, { stroke: C.purple, w: 2, dash: '6 4' })
  b += T(x1 - 14, 345, 'cucitura del bordo: prende facce + anima', { size: 11.5, anchor: 'end', fill: C.purple })
  b += T(x1 - 14, 360, 'i diffusori si fermano 1,5 cm prima (meno spessore)', { size: 11.5, anchor: 'end', fill: C.muted })
  // regole
  const rules = [
    'Il raggio è fissato solo dal lato del centro: in punta resta ~0,8 cm di gioco nel canale, così la lycra può allungarsi.',
    'Nessuna cucitura attraversa un canale: le impunture di trapunta (facoltative) stanno solo nelle valli.',
    'Più distanza LED–tessuto = luce più morbida ma pixel POV meno nitidi: la scelta si fa con i campioni (vedi prove).',
  ]
  rules.forEach((r, i) => { b += T(x0, 400 + i * 22, '• ' + r, { size: 12 }) })
  return svg(W, H, b, 'Sezione degli strati')
}

// ---------------------------------------------------------------------------
// 8. POV
function figPov() {
  const W = 1000, H = 470
  let b = ''
  b += T(24, 30, 'Immagini in movimento (POV): ogni raggio ridisegna l’immagine mentre gira', { size: 17, weight: 600 })
  const cx = 230, cy = 255, s = 5.6
  for (let r = 6; r <= 31; r += 1.667) b += Ci(cx, cy, r * s, { stroke: C.faint, sw: 1 })
  for (let a = 0; a < 360; a += 5) { const x = cx + 31 * s * Math.cos(a * D), y = cy - 31 * s * Math.sin(a * D); b += L(cx + 6 * s * Math.cos(a * D), cy - 6 * s * Math.sin(a * D), x, y, { stroke: C.faint, w: 0.6 }) }
  // un'immagine finta in coordinate polari: anello colorato + spirale
  for (let a = 0; a < 360; a += 5) for (let i = 0; i < 16; i++) {
    const r = 6 + i * 1.667
    const on = (Math.sin((a * D) * 3 + r * 0.35) > 0.55) || (i === 15)
    if (!on) continue
    const col = i === 15 ? C.purple : `hsl(${(a + r * 8) % 360},75%,55%)`
    const x = cx + r * s * Math.cos(a * D), y = cy - r * s * Math.sin(a * D)
    b += `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" fill="${col}" opacity="0.75"/>`
  }
  for (let k = 0; k < 8; k++) {
    const a = 10 + k * 45
    b += L(cx + 5.2 * s * Math.cos(a * D), cy - 5.2 * s * Math.sin(a * D), cx + 31.9 * s * Math.cos(a * D), cy - 31.9 * s * Math.sin(a * D), { stroke: '#2b2f38', w: 5, cap: 'butt' })
  }
  b += P(`M${cx + 34 * s * Math.cos(60 * D)},${cy - 34 * s * Math.sin(60 * D)} A${34 * s},${34 * s} 0 0 0 ${cx + 34 * s * Math.cos(100 * D)},${cy - 34 * s * Math.sin(100 * D)}`, { stroke: C.ink, w: 1.6, marker: 'arr' })
  b += T(cx, 452, '8 raggi × 3 giri/s = ogni punto viene ridisegnato 24 volte al secondo', { size: 12, anchor: 'middle' })
  // destra: risoluzione radiale
  const x0 = 470
  b += T(x0, 80, 'Risoluzione e frequenza', { size: 15, weight: 600 })
  const rows = [
    ['giri al secondo', '2', '3', '4', '5'],
    ['ridisegni al secondo (8 raggi)', '16', '24', '32', '40'],
    ['colonne/s per passi da 2°', '360', '540', '720', '900'],
    ['aggiornamenti LED possibili/s *', '≈ 1900', '≈ 1900', '≈ 1900', '≈ 1900'],
  ]
  rows.forEach((row, i) => {
    const y = 110 + i * 26
    b += T(x0, y, row[0], { size: 12, weight: i === 0 ? 600 : 400 })
    row.slice(1).forEach((c, j) => { b += T(x0 + 270 + j * 62, y, c, { size: 12, anchor: 'middle', weight: i === 0 ? 600 : 400 }) })
    b += L(x0, y + 8, x0 + 500, y + 8, { stroke: C.faint, w: 1 })
  })
  b += T(x0, 222, '* 256 LED APA102/HD107S a 16 MHz; con HD108 (64 bit per LED) circa la metà.', { size: 11, fill: C.muted })
  // sfalsamento
  b += T(x0, 262, 'Sfalsare i raggi raddoppia gli anelli dell’immagine', { size: 14, weight: 600 })
  const sx = x0, sy = 282, pitch = 44
  b += R(sx, sy, 380, 18, { fill: '#2b2f38', stroke: 'none', rx: 3 })
  for (let i = 0; i < 8; i++) b += R(sx + 14 + i * pitch, sy + 4, 10, 10, { fill: '#fff', stroke: 'none', rx: 1.5 })
  b += T(sx + 392, sy + 13, 'raggi dispari', { size: 11.5 })
  b += R(sx, sy + 28, 380, 18, { fill: '#2b2f38', stroke: C.purple, sw: 1.6, rx: 3 })
  for (let i = 0; i < 8; i++) b += R(sx + 14 + pitch / 2 + i * pitch, sy + 32, 10, 10, { fill: C.purple, stroke: 'none', rx: 1.5 })
  b += T(sx + 392, sy + 41, 'raggi pari, +½ passo', { size: 11.5, fill: C.purple })
  for (let i = 0; i < 8; i++) { b += L(sx + 19 + i * pitch, sy + 60, sx + 19 + i * pitch, sy + 70, { stroke: C.ink, w: 1.4 }); b += L(sx + 19 + pitch / 2 + i * pitch, sy + 60, sx + 19 + pitch / 2 + i * pitch, sy + 70, { stroke: C.purple, w: 1.4 }) }
  b += T(sx + 392, sy + 69, 'anelli risultanti', { size: 11.5, fill: C.muted })
  b += T(x0, 390, 'Senza sfalsamento: 16 anelli, ogni anello ridisegnato 8 volte per giro.', { size: 12 })
  b += T(x0, 410, 'Con i raggi pari spostati di 8 mm: 32 anelli, ma 4 ridisegni per giro.', { size: 12 })
  b += T(x0, 430, 'Si decide prima di cucire, provandolo nel simulatore.', { size: 12, fill: C.muted })
  return svg(W, H, b, 'Principio del POV')
}

function quartoUnoAUno() {
  const g = starGeometry(67, 1)
  const mm = (p) => [p[0] * 10, -p[1] * 10]
  const cut = [[0, 0], ...g.quarter.cut, [0, 0]].map(mm)
  const st = g.quarter.stitch.map(mm)
  const W = 360, H = 360
  let b = `<g transform="translate(5 ${H - 5})">`
  b += `<path d="${cut.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])).join(' ')}" fill="none" stroke="#000" stroke-width="0.5"/>`
  b += `<path d="${st.map((p, i) => (i ? 'L' : 'M') + f(p[0]) + ',' + f(p[1])).join(' ')}" fill="none" stroke="#6d48c9" stroke-width="0.4" stroke-dasharray="3 2"/>`
  b += `<path d="M0,0 L349,0 M0,0 L0,-349" stroke="#d1453b" stroke-width="0.4" stroke-dasharray="6 3"/>`
  b += `<text x="20" y="-20" font-size="6" fill="#000">Dapo 67 cm · 1/4 · scala 1:1 · margine 1 cm compreso</text>`
  b += `<text x="20" y="-12" font-size="4.5" fill="#d1453b">linee rosse = assi: appoggia sulla piega o ruota di 90° attorno al centro</text>`
  b += `<rect x="40" y="-120" width="50" height="50" fill="none" stroke="#000" stroke-width="0.4"/><text x="42" y="-124" font-size="4">controllo: 5 cm × 5 cm</text>`
  b += '</g>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}" font-family="${FONT}"><title>Cartamodello 1:1 (un quarto)</title><rect width="${W}" height="${H}" fill="#fff"/>${b}</svg>\n`
}

save('cartamodello-1a1-quarto.svg', quartoUnoAUno())
save('fig-blocchi.svg', figBlocchi())
save('fig-schema.svg', figSchema())
save('fig-hub.svg', figHub())
save('fig-raggio.svg', figRaggio())
save('fig-cartamodello.svg', figCartamodello())
save('fig-cucitura.svg', figCucitura())
save('fig-strati.svg', figStrati())
save('fig-pov.svg', figPov())
