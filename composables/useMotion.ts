/**
 * Da dove arriva il movimento della dapo nel simulatore:
 *   fisica   il modello fisico di DapoViewer (flick, pinch, boomerang…)
 *   gesture  movimenti predefiniti, per provare un design senza avere la scheda
 *   live     la dapo vera via Bluetooth (firmware DapoIMU)
 *   file     una registrazione CSV del Dapo Lab
 *
 * Tutte le sorgenti esterne danno la stessa cosa: un quaternione (tessuto → mondo con Z in alto),
 * accelerazione (g), giroscopio (°/s) e un'altezza stimata (m) per i lanci.
 */
import type { ImuSample } from './useDapoBle'

export type Quat = [number, number, number, number]
export type Vec3 = [number, number, number]
export type MotionMode = 'fisica' | 'gesture' | 'live' | 'file'
export interface MotionPose { q: Quat; a: Vec3; g: Vec3; height: number; inFlight: boolean }
interface Frame { t: number; q: Quat; a: Vec3; g: Vec3 }
export interface Clip { id: string; name: string; frames: Frame[]; duration: number; flights: [number, number][] }

const D2R = Math.PI / 180
const G = 9.81

/* ---------------- quaternioni ---------------- */
export const qmul = (a: Quat, b: Quat): Quat => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]]
const qnorm = (a: Quat): Quat => { const n = Math.hypot(...a) || 1; return [a[0] / n, a[1] / n, a[2] / n, a[3] / n] }
const qconj = (a: Quat): Quat => [a[0], -a[1], -a[2], -a[3]]
const axisAngle = (x: number, y: number, z: number, ang: number): Quat => { const s = Math.sin(ang / 2); return [Math.cos(ang / 2), x * s, y * s, z * s] }
function rotate(q: Quat, v: Vec3): Vec3 { const p = qmul(qmul(q, [0, v[0], v[1], v[2]]), qconj(q)); return [p[1], p[2], p[3]] }
function integrate(q: Quat, g: Vec3, dt: number): Quat {
  const wx = g[0] * D2R, wy = g[1] * D2R, wz = g[2] * D2R, w = Math.hypot(wx, wy, wz)
  if (w * dt < 1e-9) return q
  const h = w * dt / 2, s = Math.sin(h) / w
  return qnorm(qmul(q, [Math.cos(h), wx * s, wy * s, wz * s]))
}
function slerp(a: Quat, b: Quat, f: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  if (d < 0) { b = [-b[0], -b[1], -b[2], -b[3]]; d = -d }
  if (d > 0.9995) return qnorm([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f])
  const th = Math.acos(d), s = Math.sin(th), ka = Math.sin((1 - f) * th) / s, kb = Math.sin(f * th) / s
  return [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb, a[3] * ka + b[3] * kb]
}
/** rotazione attorno alla verticale del mondo, per "Zero" */
function yawOf(q: Quat) {
  let f = rotate(q, [1, 0, 0]), off = 0
  if (Math.hypot(f[0], f[1]) < 0.3) { f = rotate(q, [0, 1, 0]); off = -Math.PI / 2 }
  return Math.atan2(f[1], f[0]) + off
}

/* ---------------- gesture predefinite ---------------- */
// Ogni gesture descrive nel tempo: giri/s, inclinazione del piano, precessione, ribaltamento,
// se è in volo e i colpi (in g). Da qui si ricavano quaternione, giroscopio e accelerometro
// come li misurerebbe la scheda (a 4 cm dal centro), con un po' di rumore.
interface Kin { rps: number; tilt: number; prec: number; flip: number; air: boolean; hit: number }
type KinFn = (t: number) => Kin
const smooth = (u: number) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)

const GESTURES: { id: string; name: string; duration: number; kin: KinFn }[] = [
  {
    id: 'spin', name: 'Spin sul dito', duration: 8,
    kin: t => ({ rps: 3 + 0.15 * Math.sin(t * 0.8), tilt: 0.06 + 0.03 * Math.sin(t * 1.7), prec: t * 0.6, flip: 0, air: false, hit: 0 })
  },
  {
    id: 'flick', name: 'Flick e lancio', duration: 6.5,
    kin: t => {
      const up = smooth((t - 0.8) / 0.35)                                   // flick: spin da 0 a 3,5 giri/s
      let rps = 3.5 * up, tilt = 0.03 + 0.22 * up * Math.exp(-Math.max(0, t - 1.1) * 2.5) * Math.abs(Math.sin(t * 9))
      const air = t > 2.0 && t < 2.62
      const hit = t >= 2.62 && t < 2.66 ? 4.5 : 0
      if (t > 2.62) { rps = 3.5 * 0.9 * Math.exp(-(t - 2.62) * 0.25); tilt = 0.05 + 0.12 * smooth((t - 4.5) / 2) * (0.5 + 0.5 * Math.sin(t * 6)) }
      return { rps, tilt, prec: t * 1.2, flip: 0, air, hit }
    }
  },
  {
    id: 'flip', name: 'Lancio con flip', duration: 6,
    kin: t => {
      let flip = 0, air = false, hit = 0
      if (t > 1.4 && t < 2.1) { air = true; flip = Math.PI * smooth((t - 1.4) / 0.7) } else if (t >= 2.1) flip = Math.PI
      if (t >= 2.1 && t < 2.14) hit = 4
      if (t > 3.8 && t < 4.5) { air = true; flip = Math.PI + Math.PI * smooth((t - 3.8) / 0.7) } else if (t >= 4.5) flip = 2 * Math.PI
      if (t >= 4.5 && t < 4.54) hit = 4
      return { rps: 3, tilt: 0.05 + 0.03 * Math.sin(t * 2), prec: t * 0.8, flip, air, hit }
    }
  },
  {
    id: 'wobble', name: 'Wobble (rallenta)', duration: 7,
    kin: t => ({ rps: Math.max(0.5, 2 - t * 0.2), tilt: 0.1 + 0.3 * smooth(t / 5), prec: t * 2.4, flip: 0, air: false, hit: 0 })
  },
  {
    id: 'ruota', name: 'Ruota verticale', duration: 6,
    kin: t => ({ rps: 1.6, tilt: Math.PI / 2 * smooth(t / 0.8) + 0.05 * Math.sin(t * 1.3), prec: 0.4 * Math.sin(t * 0.5), flip: 0, air: false, hit: 0 })
  }
]

function synthesize(id: string, name: string, duration: number, kin: KinFn): Clip {
  const dt = 0.01, frames: Frame[] = [], flights: [number, number][] = []
  let spin = 0, prev: Quat | null = null, airStart = -1
  let seed = 1
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5 }
  for (let i = 0; i <= Math.round(duration / dt); i++) {
    const t = i * dt, k = kin(t)
    spin += k.rps * 2 * Math.PI * dt
    let q = axisAngle(0, 0, 1, k.prec)
    q = qmul(q, axisAngle(1, 0, 0, k.tilt))
    q = qmul(q, axisAngle(0, 1, 0, k.flip))
    q = qnorm(qmul(q, axisAngle(0, 0, 1, spin)))
    let g: Vec3 = [0, 0, 0]
    if (prev) {
      let d = qmul(qconj(prev), q)
      if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]]
      const s = Math.hypot(d[1], d[2], d[3])
      if (s > 1e-9) { const ang = 2 * Math.atan2(s, d[0]) / dt / D2R; g = [d[1] / s * ang, d[2] / s * ang, d[3] / s * ang] }
    }
    prev = q
    const up = rotate(qconj(q), [0, 0, 1])
    const w = k.rps * 2 * Math.PI
    let a: Vec3 = k.air ? [0, 0, 0] : [up[0] - w * w * 0.04 / G, up[1], up[2]]
    if (k.hit) a = [a[0], a[1], a[2] + k.hit]
    frames.push({ t, q, a: [a[0] + rnd() * 0.02, a[1] + rnd() * 0.02, a[2] + rnd() * 0.02], g: [g[0] + rnd() * 0.5, g[1] + rnd() * 0.5, g[2] + rnd() * 0.5] })
    if (k.air && airStart < 0) airStart = t
    if (!k.air && airStart >= 0) { flights.push([airStart, t]); airStart = -1 }
  }
  return { id, name, frames, duration, flights }
}

let gestureCache: Clip[] | null = null
export function gestureClips(): Clip[] {
  if (gestureCache) return gestureCache
  const clips = GESTURES.map(g => synthesize(g.id, g.name, g.duration, g.kin))
  // sequenza completa: tutte di fila, per vedere un design "in azione" senza fare niente
  const all: Frame[] = [], flights: [number, number][] = []
  let t0 = 0
  for (const c of clips) {
    for (const f of c.frames) all.push({ ...f, t: f.t + t0 })
    for (const [a, b] of c.flights) flights.push([a + t0, b + t0])
    t0 += c.duration + 0.01
  }
  gestureCache = [{ id: 'mix', name: 'Sequenza completa', frames: all, duration: t0, flights }, ...clips]
  return gestureCache
}

/* ---------------- registrazioni del Dapo Lab (CSV) ---------------- */
function detectFlights(frames: Frame[]): [number, number][] {
  const out: [number, number][] = []
  let start = -1
  for (const f of frames) {
    const an = Math.hypot(...f.a)
    if (an < 0.35) { if (start < 0) start = f.t }
    else if (start >= 0) { if (f.t - start > 0.08) out.push([start, f.t]); start = -1 }
  }
  return out
}

export function parseDapoCsv(text: string, fileName: string): Clip[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  const head = lines.shift()?.split(',').map(s => s.trim()) ?? []
  const col = (n: string) => head.indexOf(n)
  const need = ['t_s', 'ax_g', 'ay_g', 'az_g', 'gx_dps', 'gy_dps', 'gz_dps', 'qw', 'qx', 'qy', 'qz']
  if (need.some(n => col(n) < 0)) throw new Error('Non sembra un CSV del Dapo Lab (mancano colonne come t_s, qw…)')
  const groups = new Map<string, { label: string; frames: Frame[] }>()
  for (const l of lines) {
    const p = l.split(',')
    const key = col('session') >= 0 ? p[col('session')] : '1'
    const label = col('label') >= 0 ? p[col('label')] : ''
    const n = (c: string) => Number(p[col(c)])
    const f: Frame = { t: n('t_s'), q: qnorm([n('qw'), n('qx'), n('qy'), n('qz')]), a: [n('ax_g'), n('ay_g'), n('az_g')], g: [n('gx_dps'), n('gy_dps'), n('gz_dps')] }
    if ([f.t, ...f.q, ...f.a, ...f.g].some(Number.isNaN)) continue
    if (!groups.has(key)) groups.set(key, { label, frames: [] })
    groups.get(key)!.frames.push(f)
  }
  const clips: Clip[] = []
  for (const [key, { label, frames }] of groups) {
    if (frames.length < 10) continue
    const t0 = frames[0].t
    for (const f of frames) f.t -= t0
    const duration = frames[frames.length - 1].t
    clips.push({ id: `${fileName}#${key}`, name: `${label || 'sessione'} (${key}) · ${duration.toFixed(1)} s`, frames, duration, flights: detectFlights(frames) })
  }
  if (!clips.length) throw new Error('Nessuna sessione valida nel file')
  return clips
}

/* ---------------- stato condiviso ---------------- */
const mode = ref<MotionMode>('fisica')
const clipId = ref('mix')
const playing = ref(true)
const speed = ref(1)
const playhead = ref(0)
const fileClips = shallowRef<Clip[]>([])
let yawOff: Quat = [1, 0, 0, 0]
let lastWall = 0

// dapo vero
let liveSample: ImuSample | null = null
let liveFlightStart = -1, liveLastFlight = 0.6, liveLanded = -1, liveHeightAtLanding = 0
let unsubscribe: (() => void) | null = null

function currentClip(): Clip | null {
  const list = mode.value === 'file' ? fileClips.value : gestureClips()
  return list.find(c => c.id === clipId.value) ?? list[0] ?? null
}

function clipSample(c: Clip, t: number): Frame {
  const fr = c.frames
  let lo = 0, hi = fr.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fr[mid].t <= t) lo = mid; else hi = mid }
  const a = fr[lo], b = fr[hi], f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0
  const mix = (x: Vec3, y: Vec3): Vec3 => [x[0] + (y[0] - x[0]) * f, x[1] + (y[1] - x[1]) * f, x[2] + (y[2] - x[2]) * f]
  return { t, q: slerp(a.q, b.q, f), a: mix(a.a, b.a), g: mix(a.g, b.g) }
}

function clipHeight(c: Clip, t: number) {
  for (const [t0, t1] of c.flights) if (t >= t0 && t <= t1) return { h: G / 2 * (t - t0) * (t1 - t), air: true }
  return { h: 0, air: false }
}

/** posa del momento (null in modalità fisica) */
function pose(now: number): MotionPose | null {
  const dtWall = lastWall ? Math.min(0.1, (now - lastWall) / 1000) : 0
  lastWall = now
  if (mode.value === 'gesture' || mode.value === 'file') {
    const c = currentClip()
    if (!c) return null
    if (playing.value) playhead.value = (playhead.value + dtWall * speed.value) % Math.max(0.01, c.duration)
    const f = clipSample(c, playhead.value)
    const { h, air } = clipHeight(c, playhead.value)
    return { q: qmul(yawOff, f.q), a: f.a, g: f.g, height: h, inFlight: air }
  }
  if (mode.value === 'live') {
    const s = liveSample
    if (!s) return null
    const age = (now - s.t) / 1000
    const q = age > 0 && age < 0.06 ? integrate(s.q, s.g, age) : s.q
    // altezza: l'IMU non misura la posizione. In volo seguiamo una parabola lunga quanto il lancio precedente,
    // all'atterraggio torniamo giù in fretta.
    const an = Math.hypot(...s.a)
    const tNow = now / 1000
    if (an < 0.35) { if (liveFlightStart < 0) liveFlightStart = tNow }
    else if (liveFlightStart >= 0) {
      const dur = tNow - liveFlightStart
      if (dur > 0.08) { liveLastFlight = Math.min(1.2, Math.max(0.2, dur)); liveLanded = tNow; liveHeightAtLanding = Math.max(0, G / 2 * dur * (liveLastFlight - dur)) }
      liveFlightStart = -1
    }
    let height = 0, inFlight = false
    if (liveFlightStart >= 0) {
      const u = tNow - liveFlightStart
      height = Math.max(0, G / 2 * u * (liveLastFlight - u)); inFlight = true
    } else if (liveLanded >= 0 && tNow - liveLanded < 0.25) {
      height = liveHeightAtLanding * (1 - (tNow - liveLanded) / 0.25)
    }
    return { q: qmul(yawOff, q), a: s.a, g: s.g, height, inFlight }
  }
  return null
}

function setMode(m: MotionMode) {
  mode.value = m
  yawOff = [1, 0, 0, 0]
  if (m === 'gesture' && !gestureClips().some(c => c.id === clipId.value)) clipId.value = 'mix'
  if (m === 'file' && fileClips.value.length && !fileClips.value.some(c => c.id === clipId.value)) clipId.value = fileClips.value[0].id
  playhead.value = 0
  if (m === 'live') {
    if (!unsubscribe) unsubscribe = useDapoBle().onSample(s => { liveSample = s })
  } else if (unsubscribe) { unsubscribe(); unsubscribe = null; liveSample = null }
}

function selectClip(id: string) { clipId.value = id; playhead.value = 0; yawOff = [1, 0, 0, 0] }

async function loadCsv(file: File) {
  const list = parseDapoCsv(await file.text(), file.name)
  fileClips.value = list
  setMode('file')
  selectClip(list[0].id)
  return list.length
}

/** riallinea la rotazione attorno alla verticale: la punta +X guarda verso destra */
function zero() {
  const p = pose(performance.now())
  if (!p) return
  yawOff = qmul(axisAngle(0, 0, 1, -yawOf(p.q)), yawOff)
}

export function useMotion() {
  return {
    mode: readonly(mode), clipId: readonly(clipId), playing, speed, playhead: readonly(playhead), fileClips: readonly(fileClips),
    gestureClips, currentClip, setMode, selectClip, loadCsv, zero, pose,
    hasLiveData: () => !!liveSample && performance.now() - liveSample.t < 1000
  }
}
