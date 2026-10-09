<script setup lang="ts">
/**
 * Simulatore fisico del dapo — rendering WebGL (nessuna dipendenza).
 *
 * Dapo standard: 67 cm, ~400 g di tessuto pesante, forma a stella a 8 punte
 * (due quadrati a 45°). Il tessuto è una mesh 40×40 deformata nel vertex shader:
 * drappeggio continuo attorno al punto di appoggio (il dito), pieghe radiali,
 * distensione centrifuga con lo spin. Il ritaglio a stella e l'antialiasing
 * del bordo sono fatti nel fragment shader (distanza firmata), quindi qualsiasi
 * immagine raster "prende la forma" del dapo.
 */
const props = defineProps<{ front: string; back: string }>()

/* ---------- costanti fisiche ---------- */
const DIAMETER = 0.67
const R = DIAMETER / 2
const G = 9.81
const AIR_QUAD = 0.012           // resistenza aerodinamica allo spin (1/rad)
const AIR_LIN = 0.08             // 1/s
const SPREAD_OMEGA = 12          // rad/s: oltre questo spin il tessuto è teso
const FINGER_REACH = 0.025       // m: raggio della zona d'appoggio sul dito
const FINGER_COUPLING = 4        // 1/s: trascinamento per attrito del dito che orbita

/* ---------- parametri regolabili ---------- */
const flickRevs = ref(3)         // giri/s dati dal flick
const throwHeightCm = ref(45)
const fingerFriction = ref(1.2)  // rad/s²: coppia frenante del dito fermo
const fingerRevs = ref(2.5)      // giri/s del dito che orbita
const fingerRadiusCm = ref(6)
const stabilize = ref(1)
const pinchRevs = ref(1.5)       // giri/s della ruota quando viene pinzata
const PINCH_HAND_Y = 0.52        // m: altezza delle mani
const PINCH_HAND_X = 0.22        // m: mano destra (+) / sinistra (−)
const PINCH_RHO = 0.5            // frazione del raggio: si pinza a metà raggio, in basso
const PINCH_T = 0.55             // s: durata della pinzata (frenata per torsione)
const PINCH_KEEP = 0.35          // frazione di spin rimasta quando si lancia: il dapo non si ferma mai
const PINCH_FLIGHT = 0.7         // s: volo da una mano all'altra
const PINCH_TILT = -0.25         // rad: la ruota è leggermente girata verso lo spettatore
const BOOM_T = 2.4               // s: durata del volo a boomerang
const BOOM_A = 0.85              // m: semiasse laterale dell'ellisse
const BOOM_D = 1.7               // m: profondità dell'ellisse
const BOOM_H = 0.3              // m: quanto sale

/* ---------- stato ---------- */
const omega = ref(0)             // rad/s
const spin = ref(0)              // rad
const height = ref(0)            // m
let vy = 0
const inHand = ref(true)
const wobbleAmp = ref(0)         // rad
let wobblePhase = 0
const spread = ref(0)
const sag = ref(0)
let handTwist = 0                // rad
let flickT = -1
let flickThrow = false
let flickOmegaGiven = 0
const flipped = ref(false)
let flipAngle = 0                // rad
const fingerOn = ref(false)
let fingerPhase = 0              // rad
const fingerAmt = ref(0)
let offX = 0, offY = 0           // m: traslazione del centro del tessuto nel piano della mano

/* pinch verticale (ruota nel piano verticale, sempre la stessa faccia) + boomerang */
const pinchOn = ref(false)
let vertMix = 0                  // 0 = piatta sul dito, 1 = ruota verticale
type PinchPhase = 'pinch' | 'toss'
let pinchPhase: PinchPhase = 'pinch'
let pinchHand = 1                // +1 destra, −1 sinistra
let pinchPx = 0, pinchPy = 0     // punto pinzato (locale)
let thetaCatch = 0               // spin al momento della pinzata
const pinchOmega = ref(0)        // rad/s della ruota
let pinchGather = 0              // 0..1 tessuto ammucchiato nella mano
let pinchTwist = 0               // rad di torsione attorno alla pinza
let pinchT = 0
let cx = 0, cy = PINCH_HAND_Y, cz = 0   // centro della stella (mondo)
let fromX = 0, fromY = 0, fromZ = 0     // partenza del volo
const boomOn = ref(false)
let boomT = 0
let boomMix = 0                  // per la camera
let bx = 0, by = 0, bz = 0       // m: posizione del dapo lungo l'ellisse
let bank = 0                     // rad: inclinazione nella curva

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
let raf = 0
let last = 0

function step(now: number) {
  const dt = Math.max(0, Math.min(0.033, (now - last) / 1000))
  last = now

  /* flick del polso */
  if (flickT >= 0) {
    flickT += dt
    const T = 0.28
    const p = clamp(flickT / T)
    handTwist = (p < 0.25 ? -18 * (p / 0.25) : -18 + 50 * Math.pow((p - 0.25) / 0.75, 0.6)) * Math.PI / 180
    if (p > 0.25) {
      const u = (p - 0.25) / 0.75
      const target = flickRevs.value * 2 * Math.PI * Math.pow(u, 5)
      const d = target - flickOmegaGiven
      if (d > 0) { omega.value += d; flickOmegaGiven = target; wobbleAmp.value = Math.min(0.6, wobbleAmp.value + d * 0.016) }
    }
    if (p >= 0.6 && flickThrow && inHand.value && throwHeightCm.value > 0) {
      vy = Math.sqrt(2 * G * throwHeightCm.value / 100)
      inHand.value = false; flickThrow = false
    }
    if (p >= 1) { flickT = -1; handTwist = 0 }
  } else {
    handTwist += (0 - handTwist) * Math.min(1, dt * 12)
  }

  /* verticale: gravità, atterraggio sul dito */
  if (!inHand.value) {
    vy -= G * dt
    height.value += vy * dt
    if (height.value <= 0) {
      const impact = Math.abs(vy)
      height.value = 0; vy = 0; inHand.value = true
      sag.value = Math.min(1.2, sag.value + impact * 0.22)
      wobbleAmp.value = Math.min(0.5, wobbleAmp.value + impact * 0.07)
      omega.value *= 0.9
    }
  }

  /* dito che orbita */
  const fingerActive = fingerOn.value && inHand.value && flickT < 0
  fingerAmt.value += ((fingerActive ? 1 : 0) - fingerAmt.value) * Math.min(1, dt * 6)
  const fingerOmega = fingerRevs.value * 2 * Math.PI
  if (fingerAmt.value > 0.001) fingerPhase += fingerOmega * dt

  /* spin */
  const w = omega.value
  let dw = -AIR_QUAD * w * Math.abs(w) - AIR_LIN * w
  if (fingerActive) dw += FINGER_COUPLING * (fingerOmega - w) * fingerAmt.value
  else if (inHand.value && w > 0) dw -= fingerFriction.value
  omega.value = Math.max(0, w + dw * dt)
  if (flickT < 0 && omega.value < 0.15) omega.value = 0
  spin.value = (spin.value + omega.value * dt) % (2 * Math.PI)

  /* nutazione (≈2ω per un disco sottile), smorzata dallo spin */
  wobblePhase += (2 * omega.value + 2) * dt
  wobbleAmp.value *= Math.exp(-(0.6 + omega.value * 0.35 * stabilize.value) * dt)
  if (inHand.value && omega.value > 1 && omega.value < 6) {
    wobbleAmp.value = Math.min(0.17, wobbleAmp.value + (6 - omega.value) * dt * 0.026)
  }

  /* tessuto: centrifuga vs gravità */
  const target = inHand.value && !boomOn.value ? clamp(omega.value / SPREAD_OMEGA) : 1
  spread.value += (target - spread.value) * Math.min(1, dt * (target > spread.value ? 7 : 3))
  sag.value *= Math.exp(-3.2 * dt)

  /* il centro del tessuto segue il dito con ritardo e ampiezza ridotta
     (il dito scorre sotto il tessuto: ω → Ω, il centro quasi non si sposta) */
  const e = fingerAmt.value * fingerRadiusCm.value / 100 * 0.3
  const lag = Math.PI / 3
  const tx = e * Math.cos(fingerPhase - lag), ty = e * Math.sin(fingerPhase - lag)
  offX += (tx - offX) * Math.min(1, dt * 8)
  offY += (ty - offY) * Math.min(1, dt * 8)

  /* pinch verticale: la stella gira come una ruota; la mano pinza un punto a metà raggio
     in basso e lo tiene fermo: la stella continua per inerzia attorno alla pinza mentre
     la torsione cresce e la frena; poi lancio all'altra mano, che pinza al volo */
  const vertActive = pinchOn.value && inHand.value && flickT < 0
  vertMix += ((vertActive ? 1 : 0) - vertMix) * Math.min(1, dt * 4)
  if (vertMix < 0.001 && !vertActive) vertMix = 0
  const handX = () => pinchHand * PINCH_HAND_X
  if (vertActive) {
    pinchT += dt
    if (pinchPhase === 'pinch') {
      // frenata per torsione: lo spin cala ma non si ferma; si lancia prima dell'arresto
      const u = clamp(pinchT / PINCH_T)
      const w0 = pinchRevs.value * 2 * Math.PI
      pinchOmega.value = w0 * (1 - (1 - PINCH_KEEP) * u)
      pinchGather += (1 - pinchGather) * Math.min(1, dt * 10)
      pinchTwist = spin.value - thetaCatch
      // la stella ruota attorno alla pinza: il centro orbita attorno alla mano
      const d = spin.value - thetaCatch
      cx = handX() - Math.sin(d) * PINCH_RHO * R
      cy = PINCH_HAND_Y + Math.cos(d) * PINCH_RHO * R
      cz = 0
      if (u >= 1) {
        // lancio verso l'altra mano prima che si fermi, stessa faccia esposta
        pinchPhase = 'toss'; pinchT = 0
        fromX = cx; fromY = cy; fromZ = cz
        pinchHand = -pinchHand
      }
    } else if (pinchPhase === 'toss') {
      const u = clamp(pinchT / PINCH_FLIGHT)
      pinchGather += (0 - pinchGather) * Math.min(1, dt * 8)
      pinchTwist *= Math.exp(-14 * dt)                     // la torsione si scioglie…
      pinchOmega.value += (pinchRevs.value * 2 * Math.PI - pinchOmega.value) * Math.min(1, dt * 6) // …e il lancio ridà lo spin
      const toX = handX(), toY = PINCH_HAND_Y + PINCH_RHO * R
      cx = fromX + (toX - fromX) * u
      cy = fromY + (toY - fromY) * u + 0.9 * u * (1 - u)   // arco basso, come un passaggio tra le mani
      cz = 0
      if (u >= 1) catchNow()
    }
    spin.value = (spin.value + pinchOmega.value * dt) % (2 * Math.PI)
    omega.value = 0
  } else {
    pinchOmega.value *= Math.exp(-2.5 * dt)
    pinchGather *= Math.exp(-4 * dt)
    pinchTwist *= Math.exp(-6 * dt)
    // rientro verso il dito
    cx *= Math.exp(-5 * dt); cz *= Math.exp(-5 * dt)
    cy += (PINCH_HAND_Y - cy) * Math.min(1, dt * 5)
  }

  /* boomerang: piatto, parte verso sinistra, si allontana e rientra da destra
     lungo un'ellisse, girando sempre in orizzontale, fino a tornare sul dito */
  boomMix += ((boomOn.value ? 1 : 0) - boomMix) * Math.min(1, dt * 3)
  if (boomOn.value) {
    boomT += dt
    const u = clamp(boomT / BOOM_T)
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2   // parte e arriva morbido
    const a = 2 * Math.PI * e
    bx = -BOOM_A * Math.sin(a)
    bz = -BOOM_D * (1 - Math.cos(a)) / 2
    by = BOOM_H * Math.sin(Math.PI * e)
    bank = 0.5 * Math.sin(a)                                             // si inclina dentro la curva
    omega.value += (3 * 2 * Math.PI - omega.value) * Math.min(1, dt * 4)
    if (u >= 1) { boomOn.value = false; bx = by = bz = 0; bank = 0; wobbleAmp.value = Math.min(0.3, wobbleAmp.value + 0.15) }
  } else {
    bank *= Math.exp(-6 * dt)
  }

  /* flip */
  const flipTarget = flipped.value ? Math.PI : 0
  flipAngle += (flipTarget - flipAngle) * Math.min(1, dt * 9)
  if (Math.abs(flipTarget - flipAngle) < 0.001) flipAngle = flipTarget

  render()

  const alive = omega.value > 0 || !inHand.value || flickT >= 0 || flipAngle !== flipTarget ||
    fingerAmt.value > 0.001 || Math.abs(handTwist) > 0.001 || sag.value > 0.001 ||
    wobbleAmp.value > 0.001 || Math.abs(spread.value - target) > 0.002 ||
    Math.abs(offX - tx) + Math.abs(offY - ty) > 1e-4 || pinchOn.value || boomOn.value || boomMix > 0.001 || vertMix > 0 || Math.abs(pinchOmega.value) > 0.01 || pinchGather > 0.001 || fingerActive
  raf = alive ? requestAnimationFrame(step) : 0
}

function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(step) } }
function flick(withThrow = true) {
  if (!inHand.value || flickT >= 0) return
  pinchOn.value = false; boomOn.value = false
  flickT = 0; flickThrow = withThrow; flickOmegaGiven = 0; start()
}
function flip() { flipped.value = !flipped.value; start() }
function toggleFinger() { fingerOn.value = !fingerOn.value; start() }
/** la mano pinza il punto che ora sta a metà raggio in basso */
function catchNow() {
  pinchPhase = 'pinch'; pinchT = 0
  thetaCatch = spin.value
  const a = -Math.PI / 2 - spin.value
  pinchPx = Math.cos(a) * R * PINCH_RHO
  pinchPy = Math.sin(a) * R * PINCH_RHO
  pinchGather = 0; pinchTwist = 0
  pinchOmega.value = pinchRevs.value * 2 * Math.PI
  cx = pinchHand * PINCH_HAND_X; cy = PINCH_HAND_Y + PINCH_RHO * R; cz = 0
}
function togglePinch() {
  pinchOn.value = !pinchOn.value
  if (pinchOn.value) {
    fingerOn.value = false
    boomOn.value = false; pinchHand = 1; catchNow()
  }
  start()
}
function boomerang() {
  if (!inHand.value || flickT >= 0 || boomOn.value) return
  fingerOn.value = false; pinchOn.value = false
  boomOn.value = true; boomT = 0
  start()
}
function reset() {
  cancelAnimationFrame(raf); raf = 0
  omega.value = 0; spin.value = 0; height.value = 0; vy = 0; inHand.value = true
  wobbleAmp.value = 0; wobblePhase = 0; spread.value = 0; sag.value = 0
  handTwist = 0; flickT = -1; flipped.value = false; flipAngle = 0
  fingerOn.value = false; fingerAmt.value = 0; fingerPhase = 0; offX = offY = 0
  pinchOn.value = false; boomOn.value = false; boomT = 0; boomMix = 0; bx = by = bz = 0; vertMix = 0; pinchOmega.value = 0; pinchGather = 0; pinchTwist = 0; bank = 0
  cx = 0; cy = PINCH_HAND_Y; cz = 0
  render()
}
function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement) return
  if (e.code === 'Space') { e.preventDefault(); flick(true) }
  if (e.key.toLowerCase() === 'f') flip()
  if (e.key.toLowerCase() === 'd') toggleFinger()
  if (e.key.toLowerCase() === 'p') togglePinch()
  if (e.key.toLowerCase() === 'b') boomerang()
}

/* =========================================================================
   WebGL
   ========================================================================= */
const canvasEl = ref<HTMLCanvasElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const stageW = ref(900)
const stageH = computed(() => Math.round(Math.min(760, Math.max(380, stageW.value * 0.62))))
let gl: WebGLRenderingContext | null = null
let prog: WebGLProgram | null = null
let uni: Record<string, WebGLUniformLocation | null> = {}
let indexCount = 0
let texFront: WebGLTexture | null = null
let texBack: WebGLTexture | null = null
let hasDeriv = false
let ro: ResizeObserver | null = null
const webglError = ref('')

const VS = `
attribute vec2 aPos;
uniform mat4 uMVP;
uniform mat4 uModel;
uniform float uSpread, uSag, uReach, uDroopK, uDroopSign, uR;
uniform vec2 uSupport;
uniform float uPinchMix, uGather, uSigma, uTwist;
uniform vec2 uPinch;
varying vec2 vUv;
varying vec2 vLocal;
varying float vShade;

float droop(vec2 p) {
  float d = max(0.0, length(p - uSupport) - uReach);
  float base = (1.0 - uSpread) * uDroopK * pow(d, 1.6);
  float sagv = uSag * d * d * 0.7;
  // atan(0,0) è NaN su molte GPU: niente pieghe dentro la zona d'appoggio
  float fold = 0.0;
  if (d > 0.0) {
    float ang = atan(p.y - uSupport.y, p.x - uSupport.x);
    fold = (1.0 - uSpread) * 0.018 * d * (sin(ang * 8.0) * 0.7 + sin(ang * 3.0 + 1.0) * 0.3);
  }
  return -(base + sagv + fold) * uDroopSign;
}

void main() {
  vec2 p = aPos;
  float z = droop(p);
  float e = 0.006;
  float dzdx = (droop(p + vec2(e, 0.0)) - droop(p - vec2(e, 0.0))) / (2.0 * e);
  float dzdy = (droop(p + vec2(0.0, e)) - droop(p - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-dzdx, -dzdy, 1.0));
  vec3 nw = normalize(mat3(uModel) * n);
  vec3 light = normalize(vec3(0.25, 0.9, 0.5));
  vShade = 0.72 + 0.28 * abs(dot(nw, light));
  vUv = vec2(p.x / uR * 0.5 + 0.5, p.y / uR * 0.5 + 0.5);
  vLocal = p;
  vec3 pos = vec3(p, z);
  if (uPinchMix > 0.0) {
    // il tessuto vicino alla pinza resta con la mano: si torce e si ammucchia
    vec2 r = p - uPinch;
    float w = exp(-dot(r, r) / (2.0 * uSigma * uSigma));
    float a = -uTwist * w * 0.18;                       // solo lo strato esterno: deformazione appena accennata
    vec2 rr = vec2(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a)) * (1.0 - 0.12 * w * uGather);
    float zz = z * (1.0 - uPinchMix) + 0.015 * w * uGather;
    pos = mix(vec3(p, z), vec3(uPinch + rr, zz), uPinchMix);
    vShade = mix(vShade, vShade * (1.0 - 0.12 * w * uGather), uPinchMix);
  }
  gl_Position = uMVP * vec4(pos, 1.0);
}`

const FS = (deriv: boolean) => `
${deriv ? '#extension GL_OES_standard_derivatives : enable' : ''}
precision mediump float;
uniform sampler2D uFront, uBack;
uniform float uHalfSide;
varying vec2 vUv;
varying vec2 vLocal;
varying float vShade;

float sdBox(vec2 p, float s) {
  vec2 d = abs(p) - s;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
void main() {
  vec2 p = vLocal;
  float c = 0.70710678;
  vec2 q = vec2(p.x * c - p.y * c, p.x * c + p.y * c);
  float sd = min(sdBox(p, uHalfSide), sdBox(q, uHalfSide));
  float w = ${deriv ? 'fwidth(sd)' : '0.002'};
  float a = 1.0 - smoothstep(-w, w, sd);
  if (a <= 0.003) discard;
  vec4 col = gl_FrontFacing ? texture2D(uFront, vUv) : texture2D(uBack, vec2(vUv.x, 1.0 - vUv.y));
  if (col.a < 0.02) discard;
  gl_FragColor = vec4(col.rgb * vShade, col.a * a);
}`

function compile(type: number, src: string) {
  const sh = gl!.createShader(type)!
  gl!.shaderSource(sh, src); gl!.compileShader(sh)
  if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(sh) || 'shader')
  return sh
}

function initGL() {
  const c = canvasEl.value!
  gl = (c.getContext('webgl', { antialias: true, alpha: false, premultipliedAlpha: false }) ||
    c.getContext('experimental-webgl')) as WebGLRenderingContext | null
  if (!gl) { webglError.value = 'WebGL non disponibile su questo dispositivo.'; return }
  hasDeriv = !!gl.getExtension('OES_standard_derivatives')

  prog = gl.createProgram()!
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS))
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS(hasDeriv)))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || 'link')
  gl.useProgram(prog)
  for (const n of ['uMVP', 'uModel', 'uSpread', 'uSag', 'uReach', 'uDroopK', 'uDroopSign', 'uR', 'uSupport', 'uFront', 'uBack', 'uHalfSide', 'uPinchMix', 'uGather', 'uSigma', 'uTwist', 'uPinch'])
    uni[n] = gl.getUniformLocation(prog, n)

  /* mesh: griglia N×N sul quadrato [-R, R]² */
  const N = 40
  const pos = new Float32Array((N + 1) * (N + 1) * 2)
  let k = 0
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    pos[k++] = (i / N * 2 - 1) * R
    pos[k++] = (j / N * 2 - 1) * R
  }
  const idx = new Uint16Array(N * N * 6)
  k = 0
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c2 = a + N + 1, d = c2 + 1
    // antiorario visto da +z (lato fronte)
    idx[k++] = a; idx[k++] = b; idx[k++] = c2
    idx[k++] = b; idx[k++] = d; idx[k++] = c2
  }
  indexCount = idx.length
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW)
  const aPos = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(aPos); gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  const ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW)

  gl.enable(gl.DEPTH_TEST)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
  gl.uniform1f(uni.uR, R)
  gl.uniform1f(uni.uHalfSide, R * Math.SQRT1_2)
  gl.uniform1f(uni.uDroopK, 0.9)
  gl.uniform1f(uni.uSigma, 0.07)
  gl.uniform1i(uni.uFront, 0)
  gl.uniform1i(uni.uBack, 1)
  texFront = makeTexture(); texBack = makeTexture()
}

function makeTexture() {
  const t = gl!.createTexture()!
  gl!.bindTexture(gl!.TEXTURE_2D, t)
  gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, 1, 1, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, new Uint8Array([40, 40, 40, 255]))
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE)
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE)
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR)
  gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR)
  return t
}

const isPow2 = (v: number) => (v & (v - 1)) === 0
function loadTexture(tex: WebGLTexture, url: string) {
  const img = new Image()
  img.onload = () => {
    if (!gl) return
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
    if (isPow2(img.width) && isPow2(img.height)) {
      gl.generateMipmap(gl.TEXTURE_2D)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic')
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)))
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    }
    render()
  }
  img.src = url
}
watch(() => props.front, v => { if (texFront) loadTexture(texFront, v) })
watch(() => props.back, v => { if (texBack) loadTexture(texBack, v) })

/* ---- matrici 4×4 (column-major) ---- */
type M4 = Float32Array
const m4 = {
  mul(a: M4, b: M4): M4 {
    const o = new Float32Array(16)
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3]
    }
    return o
  },
  translate: (x: number, y: number, z: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]) as M4,
  rotX(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]) as M4 },
  rotY(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]) as M4 },
  rotZ(a: number) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) as M4 },
  perspective(fovy: number, aspect: number, near: number, far: number) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far)
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]) as M4
  },
  lookAt(eye: number[], c: number[], up: number[]) {
    let zx = eye[0] - c[0], zy = eye[1] - c[1], zz = eye[2] - c[2]
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]) as M4
  }
}

function resize() {
  const c = canvasEl.value; if (!c || !gl) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.round(stageW.value * dpr), h = Math.round(stageH.value * dpr)
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h }
  gl.viewport(0, 0, w, h)
}

function render() {
  if (!gl || !prog) return
  resize()
  const c = canvasEl.value!
  const aspect = c.width / c.height

  /* camera: inquadra il dapo al 62 % della larghezza, con spazio sopra per il lancio */
  const fovy = 38 * Math.PI / 180
  const tanH = Math.tan(fovy / 2) * aspect
  const dist = Math.max(1.2, (DIAMETER / 0.56) / (2 * tanH)) * (1 + 0.45 * vertMix + 0.75 * boomMix)
  // dall'alto per il dapo sul dito, quasi frontale per la ruota verticale
  const el = (36 * (1 - vertMix) + 14 * vertMix) * Math.PI / 180
  const targetY = (-0.04 + throwHeightCm.value / 100 * 0.42) * (1 - vertMix) + 0.5 * vertMix + 0.45 * boomMix
  const eye = [0, targetY + dist * Math.sin(el), dist * Math.cos(el)]
  const P = m4.perspective(fovy, aspect, 0.1, 20)
  const V = m4.lookAt(eye, [0, targetY, 0], [0, 1, 0])

  /* modello: locale (x,y nel piano del tessuto, z = alto) → mondo (Y alto) */
  const nx = wobbleAmp.value * Math.sin(wobblePhase)
  const ny = wobbleAmp.value * Math.cos(wobblePhase)
  const twist = inHand.value ? handTwist * 0.4 : 0
  let M: Float32Array
  const pm = vertMix
  if (pm > 0) {
    // ruota verticale: centro in (cx, cy, cz), gira attorno al proprio asse, stessa faccia esposta
    M = m4.translate(offX * (1 - pm) + cx * pm, cy * pm + height.value * (1 - pm), cz * pm)
    M = m4.mul(M, m4.rotY(PINCH_TILT * pm))
    M = m4.mul(M, m4.rotX(-Math.PI / 2 * (1 - pm)))
    M = m4.mul(M, m4.rotX(flipAngle * (1 - pm)))
    M = m4.mul(M, m4.rotZ(spin.value + twist * (1 - pm)))
  } else {
    M = m4.translate(offX + bx, height.value + by, offY + bz)
    M = m4.mul(M, m4.rotX(-Math.PI / 2))         // piano del tessuto orizzontale
    if (bank !== 0) M = m4.mul(M, m4.rotY(bank)) // boomerang: inclinato nella curva
    M = m4.mul(M, m4.rotX(flipAngle))             // ribaltamento sull'altro lato
    M = m4.mul(M, m4.rotX(nx)); M = m4.mul(M, m4.rotY(ny))   // nutazione
    M = m4.mul(M, m4.rotZ(spin.value + twist))    // spin
  }
  const MVP = m4.mul(m4.mul(P, V), M)

  /* punto d'appoggio (dito) espresso nel sistema del tessuto */
  const e = fingerAmt.value * fingerRadiusCm.value / 100
  const fx = Math.cos(fingerPhase) * e - offX, fy = Math.sin(fingerPhase) * e - offY
  const cs = Math.cos(-spin.value), sn = Math.sin(-spin.value)
  const sx = fx * cs - fy * sn, sy = fx * sn + fy * cs

  gl.clearColor(0.08, 0.09, 0.12, 1)
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
  gl.uniformMatrix4fv(uni.uMVP, false, MVP)
  gl.uniformMatrix4fv(uni.uModel, false, M)
  gl.uniform1f(uni.uSpread, inHand.value ? spread.value : 1)
  gl.uniform1f(uni.uSag, sag.value)
  gl.uniform1f(uni.uReach, FINGER_REACH)
  gl.uniform1f(uni.uDroopSign, Math.cos(flipAngle))
  gl.uniform2f(uni.uSupport, sx, sy)
  gl.uniform1f(uni.uPinchMix, pm)
  gl.uniform1f(uni.uGather, pinchGather * pm)
  gl.uniform1f(uni.uTwist, pinchTwist * pm)
  gl.uniform2f(uni.uPinch, pinchPx, pinchPy)
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texFront)
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texBack)
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0)
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  try { initGL() } catch (e: any) { webglError.value = 'Errore WebGL: ' + e.message }
  if (gl) { loadTexture(texFront!, props.front); loadTexture(texBack!, props.back) }
  ro = new ResizeObserver(([en]) => { stageW.value = en.contentRect.width; render() })
  if (stageEl.value) ro.observe(stageEl.value)
  start()
})
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); cancelAnimationFrame(raf); ro?.disconnect() })
watch(throwHeightCm, () => render())

const rpm = computed(() => Math.round(omega.value * 60 / (2 * Math.PI)))
const status = computed(() => {
  if (!inHand.value) return `In volo · ${(height.value * 100).toFixed(0)} cm`
  if (boomOn.value) return 'Boomerang · in volo, torna sul dito'
  if (pinchOn.value) return `Pinch verticale · mano ${pinchHand > 0 ? 'destra' : 'sinistra'} · ${pinchPhase === 'pinch' ? 'pinza, frena ma non ferma' : 'lancio all\'altra mano'} · ${Math.round(pinchOmega.value * 60 / (2 * Math.PI))} rpm`
  if (fingerOn.value) return 'Giro di dito: il dito orbita sotto il tessuto'
  if (omega.value > SPREAD_OMEGA) return 'Spin stabile sul dito, tessuto teso'
  if (omega.value > 0) return 'Rallenta sul dito… flick (Spazio) o giro di dito (D)'
  return 'Fermo sul dito — clicca o premi Spazio'
})

defineExpose({ flick, flip, reset })
</script>

<template>
  <div class="viewer">
    <div ref="stageEl" class="stage" :style="{ height: stageH + 'px' }">
      <canvas
        ref="canvasEl"
        class="gl"
        :style="{ width: '100%', height: stageH + 'px' }"
        title="Click: flick + lancio · Shift+click: solo flick · D: giro di dito · P: pinch verticale · B: boomerang · F: gira lato"
        @click="(e) => flick(!e.shiftKey)"
      />
      <p v-if="webglError" class="glerr">{{ webglError }}</p>
      <div class="hud">
        <span>{{ rpm }} rpm</span>
        <span class="status">{{ status }}</span>
      </div>
      <div class="scale">⌀ 67 cm · 400 g</div>
    </div>

    <div class="controls">
      <button class="primary" :disabled="!inHand" @click="flick(true)">Flick + lancio</button>
      <button :disabled="!inHand" @click="flick(false)">Solo flick</button>
      <button :class="{ on: fingerOn }" @click="toggleFinger">Giro di dito (D)</button>
      <button :class="{ on: pinchOn }" :disabled="!inHand" @click="togglePinch">Pinch verticale (P)</button>
      <button :disabled="!inHand || boomOn || pinchOn" @click="boomerang">Boomerang (B)</button>
      <button @click="flip">Gira lato (F)</button>
      <button @click="reset">Reset</button>
    </div>

    <details class="settings">
      <summary>Impostazioni fisica</summary>
      <label>Spin dato dal flick <span>{{ flickRevs.toFixed(1) }} giri/s</span>
        <input v-model.number="flickRevs" type="range" min="0.5" max="6" step="0.1">
      </label>
      <label>Altezza lancio <span>{{ throwHeightCm }} cm</span>
        <input v-model.number="throwHeightCm" type="range" min="0" max="120" step="5">
      </label>
      <label>Attrito del dito fermo <span>{{ fingerFriction.toFixed(1) }} rad/s²</span>
        <input v-model.number="fingerFriction" type="range" min="0.2" max="6" step="0.1">
      </label>
      <label>Velocità del giro di dito <span>{{ fingerRevs.toFixed(1) }} giri/s</span>
        <input v-model.number="fingerRevs" type="range" min="0.5" max="5" step="0.1">
      </label>
      <label>Raggio del giro di dito <span>{{ fingerRadiusCm }} cm</span>
        <input v-model.number="fingerRadiusCm" type="range" min="2" max="15" step="1">
      </label>
      <label>Velocità del pinch verticale <span>{{ pinchRevs.toFixed(1) }} giri/s</span>
        <input v-model.number="pinchRevs" type="range" min="0.5" max="3" step="0.1">
      </label>
      <label>Stabilizzazione giroscopica <span>{{ stabilize.toFixed(1) }}×</span>
        <input v-model.number="stabilize" type="range" min="0.2" max="3" step="0.1">
      </label>
    </details>
  </div>
</template>

<style scoped>
.viewer { display: flex; flex-direction: column; align-items: center; gap: 1rem; width: 100%; }
.stage {
  position: relative; width: 100%;
  border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
  background: #14171e;
}
.gl { display: block; cursor: pointer; touch-action: manipulation; }
.glerr { position: absolute; inset: 0; display: grid; place-items: center; color: #ff7b7b; margin: 0; }
.hud { position: absolute; left: 14px; top: 12px; display: flex; gap: 0.8rem; align-items: baseline; font-size: 0.85rem; color: var(--muted); pointer-events: none; }
.hud span:first-child { color: var(--accent-2); font-variant-numeric: tabular-nums; font-weight: 600; min-width: 4.5em; }
.scale { position: absolute; right: 14px; top: 12px; font-size: 0.75rem; color: var(--muted); pointer-events: none; }
.controls { display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center; }
.controls .on { border-color: var(--accent-2); color: var(--accent-2); }
.settings { width: 100%; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 0.8rem 1rem; }
.settings summary { cursor: pointer; color: var(--muted); }
.settings label { display: block; margin-top: 0.8rem; font-size: 0.85rem; }
.settings label span { float: right; color: var(--accent-2); }
</style>
