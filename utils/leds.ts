/**
 * LED simulati sulla dapo: disposizioni, effetti e disegno della "luce" in una texture
 * che il simulatore somma al design. Gli effetti sono gli stessi del Dapo Lab
 * (tools/dapo-lab/src/app.js): qui si prototipa la logica che poi andrà sulla scheda.
 */

export type LedLayoutName = 'raggi' | 'bordo'
export type LedEffectName = 'speed' | 'tacho' | 'rings' | 'spiral' | 'pov' | 'world' | 'gravity' | 'toss' | 'solid'

export const LED_LAYOUTS: { id: LedLayoutName; label: string }[] = [
  { id: 'raggi', label: 'Raggi: 8 × 16 LED' },
  { id: 'bordo', label: 'Bordo: 96 LED' }
]
export const LED_EFFECTS: { id: LedEffectName; label: string }[] = [
  { id: 'speed', label: 'Velocità → colore' },
  { id: 'tacho', label: 'Tachimetro sui raggi' },
  { id: 'rings', label: 'Anelli + onda alla presa' },
  { id: 'spiral', label: 'Spirale ferma nel mondo' },
  { id: 'pov', label: 'POV: cuore fermo nell\'aria' },
  { id: 'world', label: 'Arco fermo nel mondo' },
  { id: 'gravity', label: 'Fuoco verso il basso' },
  { id: 'toss', label: 'Lanci e prese' },
  { id: 'solid', label: 'Luce fissa (per vedere la diffusione)' }
]

/** un LED: posizione nel piano del tessuto (m), distanza normalizzata dal centro e angoli */
export interface Led {
  x: number; y: number; i: number; n: number
  rn: number; angB: number
  // aggiornati a ogni fotogramma
  angW: number; u: number; v: number; zw: number
}

function finish(pts: [number, number][]): Led[] {
  const rs = pts.map(([x, y]) => Math.hypot(x, y))
  const r0 = Math.min(...rs), r1 = Math.max(...rs)
  return pts.map(([x, y], i) => ({
    x, y, i, n: pts.length, rn: (rs[i] - r0) / Math.max(1e-6, r1 - r0), angB: Math.atan2(y, x),
    angW: 0, u: 0, v: 0, zw: 0
  }))
}

/** R = raggio punta–centro della dapo (m) */
export function makeLayout(name: LedLayoutName, R: number): Led[] {
  if (name === 'raggi') {
    const pts: [number, number][] = []
    const r0 = 0.07, r1 = R - 0.025
    for (let s = 0; s < 8; s++) {
      const a = s * Math.PI / 4
      for (let k = 0; k < 16; k++) { const r = r0 + (r1 - r0) * k / 15; pts.push([r * Math.cos(a), r * Math.sin(a)]) }
    }
    return finish(pts)
  }
  // bordo: 96 LED distribuiti sul contorno a 16 lati della stella
  const rIn = R * Math.SQRT1_2 / Math.cos(Math.PI / 8)
  const P: [number, number][] = []
  for (let i = 0; i < 16; i++) { const r = (i % 2 ? rIn : R) * 0.97, a = i * Math.PI / 8; P.push([r * Math.cos(a), r * Math.sin(a)]) }
  const seg = P.map((p, i) => { const q = P[(i + 1) % 16]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) } })
  const total = seg.reduce((s, x) => s + x.len, 0)
  const pts: [number, number][] = []
  for (let k = 0; k < 96; k++) {
    let d = (k + 0.5) * total / 96, j = 0
    while (d > seg[j].len) { d -= seg[j].len; j++ }
    const f = d / seg[j].len, s = seg[j]
    pts.push([s.p[0] + (s.q[0] - s.p[0]) * f, s.p[1] + (s.q[1] - s.p[1]) * f])
  }
  return finish(pts)
}

export interface LedContext { rpm: number; inFlight: boolean; sinceImpact: number; R: number }
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

/** colore di un LED in HSL (0..1). Stessa logica di ledEffect() nel Dapo Lab. */
export function ledEffect(mode: LedEffectName, d: Led, t: number, ctx: LedContext): [number, number, number] {
  const spin = Math.abs(ctx.rpm)
  switch (mode) {
    case 'speed': {
      const v = clamp(spin / 240, 0, 1)
      const run = Math.sin(4 * d.angB - t * 4 * Math.sign(ctx.rpm || 1))
      return [0.66 - 0.66 * v, 1, 0.1 + 0.4 * clamp(spin / 40, 0, 1) * (0.6 + 0.4 * run)]
    }
    case 'tacho': {
      const fill = clamp(spin / 240, 0, 1)
      return d.rn <= fill ? [0.33 - 0.33 * d.rn, 1, 0.45] : [0, 0, 0.03]
    }
    case 'rings': {
      const front = ctx.sinceImpact * 2.2
      const wave = ctx.sinceImpact < 0.8 ? Math.exp(-((d.rn - front) ** 2) / 0.012) : 0
      const base = 0.5 + 0.5 * Math.sin(2 * Math.PI * (d.rn * 2 - t * 0.5))
      return [(0.62 + d.rn * 0.3 + t * 0.02) % 1, 1 - 0.8 * wave, 0.06 + 0.17 * base + 0.5 * wave]
    }
    case 'spiral': {
      const ph = d.angW + d.rn * Math.PI * 2.2 - t * 0.6
      const on = (0.5 + 0.5 * Math.cos(2 * ph)) ** 3
      return [(0.8 + d.rn * 0.25) % 1, 1, 0.03 + 0.5 * on]
    }
    case 'world': {
      const a = Math.abs(Math.atan2(Math.sin(d.angW), Math.cos(d.angW)))
      return [(t * 0.05) % 1, 1, 0.04 + 0.5 * (a < 0.45 ? 1 - a / 0.45 : 0)]
    }
    case 'pov': {
      const X = d.u / ctx.R * 1.3, Y = d.v / ctx.R * 1.3 + 0.15
      const inside = (X * X + Y * Y - 1) ** 3 - X * X * Y * Y * Y <= 0
      return inside ? [0.96, 1, 0.5] : [0.62, 1, 0.025]
    }
    case 'gravity': {
      const down = clamp(-d.zw / (ctx.R * 0.6), -1, 1)
      if (down <= 0) return [0.62, 0.8, 0.03]
      const flick = 0.7 + 0.3 * Math.sin(t * 23 + d.i * 1.7)
      return [0.02 + 0.09 * (1 - down), 1, 0.06 + 0.45 * down * flick]
    }
    case 'toss': {
      if (ctx.inFlight) return [0, 0, Math.random() < 0.3 ? 0.95 : 0.25]
      if (ctx.sinceImpact < 0.6) return [0.86, 1, 0.65 * (1 - ctx.sinceImpact / 0.6) + 0.1]
      return [(0.75 + d.i / d.n * 0.2) % 1, 0.9, 0.1 + 0.08 * Math.sin(t * 2 + d.angB * 2)]
    }
    case 'solid': return [0.12, 0.15, 0.5]
  }
  return [0, 0, 0]
}

/**
 * Aggiorna gli angoli "nel mondo" dei LED. rot: matrice 3×3 (righe) che porta un punto del tessuto
 * nel riferimento del mondo con Z in alto. u, v sono la posizione vista di fronte, ferma nel mondo.
 */
export function updateWorld(leds: Led[], rot: number[]) {
  const nx = rot[2], ny = rot[5], nz = rot[8]                 // normale del tessuto nel mondo
  let rx = 1, ry = 0, rz = 0, dot = nx
  if (Math.abs(dot) > 0.9) { rx = 0; ry = 1; dot = ny }
  let e1x = rx - dot * nx, e1y = ry - dot * ny, e1z = rz - dot * nz
  const l = Math.hypot(e1x, e1y, e1z) || 1; e1x /= l; e1y /= l; e1z /= l
  const e2x = ny * e1z - nz * e1y, e2y = nz * e1x - nx * e1z, e2z = nx * e1y - ny * e1x
  for (const d of leds) {
    const wx = rot[0] * d.x + rot[1] * d.y, wy = rot[3] * d.x + rot[4] * d.y, wz = rot[6] * d.x + rot[7] * d.y
    d.u = wx * e1x + wy * e1y + wz * e1z
    d.v = wx * e2x + wy * e2y + wz * e2z
    d.angW = Math.atan2(d.v, d.u)
    d.zw = wz
  }
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [f(0) * 255, f(8) * 255, f(4) * 255]
}

/**
 * Disegna la luce dei LED nella texture (coordinate del tessuto: u = x/R/2 + 1/2).
 * diffuse: quanto la luce si allarga nel tessuto (m).
 */
export function paintLeds(ctx: CanvasRenderingContext2D, leds: Led[], colors: [number, number, number][], R: number, diffuse: number) {
  const S = ctx.canvas.width
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, S, S)
  ctx.globalCompositeOperation = 'lighter'
  const rad = Math.max(2, diffuse / (2 * R) * S)
  for (const d of leds) {
    const [h, s, l] = colors[d.i]
    if (l < 0.045) continue
    const [r, g, b] = hsl(h, s, l)
    const px = (d.x / R * 0.5 + 0.5) * S
    const py = (0.5 - d.y / R * 0.5) * S
    const grd = ctx.createRadialGradient(px, py, 0, px, py, rad)
    grd.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},0.95)`)
    grd.addColorStop(0.25, `rgba(${r | 0},${g | 0},${b | 0},0.45)`)
    grd.addColorStop(1, `rgba(${r | 0},${g | 0},${b | 0},0)`)
    ctx.fillStyle = grd
    ctx.fillRect(px - rad, py - rad, 2 * rad, 2 * rad)
  }
}
