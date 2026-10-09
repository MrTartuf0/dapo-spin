<script setup lang="ts">
/**
 * Editor della cornice: posiziona, scala e ruota un'immagine dentro la stella
 * del dapo, con anteprima. "Applica" rasterizza il risultato (PNG 1024×1024,
 * trasparente fuori dalla stella) pronto per il simulatore.
 */
const props = defineProps<{ file: File; title: string }>()
const emit = defineEmits<{ apply: [dataUrl: string]; cancel: [] }>()

const PREVIEW = 380
const canvas = ref<HTMLCanvasElement | null>(null)
const img = ref<HTMLImageElement | null>(null)
const scale = ref(1)       // 1 = "cover" della cornice
const rot = ref(0)         // gradi
const ox = ref(0)          // px di anteprima
const oy = ref(0)
const error = ref('')
let objectUrl = ''

const STAR = (() => {
  const pts: [number, number][] = []
  const inner = Math.cos(Math.PI / 4) / Math.cos(Math.PI / 8)
  for (let k = 0; k < 16; k++) {
    const a = k * Math.PI / 8
    const r = k % 2 === 0 ? 1 : inner
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  return pts
})()

function starPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath()
  STAR.forEach(([x, y], i) => i ? ctx.lineTo(cx + x * r, cy + y * r) : ctx.moveTo(cx + x * r, cy + y * r))
  ctx.closePath()
}

/** scala "cover" di base: l'immagine riempie tutto il quadrato della cornice */
function coverScale(size: number) {
  const im = img.value!
  return Math.max(size / im.naturalWidth, size / im.naturalHeight)
}

function drawImage(ctx: CanvasRenderingContext2D, size: number) {
  const im = img.value!
  const k = size / PREVIEW
  const s = coverScale(size) * scale.value
  ctx.save()
  ctx.translate(size / 2 + ox.value * k, size / 2 + oy.value * k)
  ctx.rotate(rot.value * Math.PI / 180)
  ctx.scale(s, s)
  ctx.drawImage(im, -im.naturalWidth / 2, -im.naturalHeight / 2)
  ctx.restore()
}

function draw() {
  const c = canvas.value; if (!c || !img.value) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = PREVIEW * dpr; c.height = PREVIEW * dpr
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  ctx.fillStyle = '#0d0f13'; ctx.fillRect(0, 0, PREVIEW, PREVIEW)
  drawImage(ctx, PREVIEW)
  // oscura fuori dalla stella
  ctx.save()
  ctx.beginPath(); ctx.rect(0, 0, PREVIEW, PREVIEW)
  STAR.forEach(([x, y], i) => {
    const px = PREVIEW / 2 + x * PREVIEW / 2, py = PREVIEW / 2 + y * PREVIEW / 2
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(8,9,12,0.72)'
  ctx.fill('evenodd')
  ctx.restore()
  starPath(ctx, PREVIEW / 2, PREVIEW / 2, PREVIEW / 2 - 0.5)
  ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5; ctx.stroke()
  // centro
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(PREVIEW / 2 - 8, PREVIEW / 2); ctx.lineTo(PREVIEW / 2 + 8, PREVIEW / 2)
  ctx.moveTo(PREVIEW / 2, PREVIEW / 2 - 8); ctx.lineTo(PREVIEW / 2, PREVIEW / 2 + 8); ctx.stroke()
}

watch([scale, rot, ox, oy], draw)

/* ---- interazione: drag per spostare, rotella per zoom ---- */
let dragging = false, lx = 0, ly = 0
function onDown(e: PointerEvent) { dragging = true; lx = e.clientX; ly = e.clientY; (e.target as Element).setPointerCapture(e.pointerId) }
function onMove(e: PointerEvent) {
  if (!dragging) return
  ox.value += e.clientX - lx; oy.value += e.clientY - ly; lx = e.clientX; ly = e.clientY
}
function onUp() { dragging = false }
function onWheel(e: WheelEvent) {
  e.preventDefault()
  scale.value = Math.min(6, Math.max(0.2, scale.value * (e.deltaY < 0 ? 1.06 : 1 / 1.06)))
}
function fit() { scale.value = 1; rot.value = 0; ox.value = 0; oy.value = 0 }
function contain() {
  const im = img.value!
  // l'intera immagine dentro la stella (approssimando la stella con il suo quadrato interno)
  const inner = Math.SQRT1_2
  scale.value = Math.min(PREVIEW * inner / im.naturalWidth, PREVIEW * inner / im.naturalHeight) / coverScale(PREVIEW)
  rot.value = 0; ox.value = 0; oy.value = 0
}

function apply() {
  const SIZE = 1024
  const c = document.createElement('canvas'); c.width = c.height = SIZE
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  starPath(ctx, SIZE / 2, SIZE / 2, SIZE / 2); ctx.clip()
  drawImage(ctx, SIZE)
  emit('apply', c.toDataURL('image/png'))
}

onMounted(() => {
  objectUrl = URL.createObjectURL(props.file)
  const im = new Image()
  im.onload = () => { img.value = im; nextTick(draw) }
  im.onerror = () => { error.value = 'Impossibile leggere l\'immagine' }
  im.src = objectUrl
})
onBeforeUnmount(() => { if (objectUrl) URL.revokeObjectURL(objectUrl) })
</script>

<template>
  <div class="backdrop" @click.self="emit('cancel')">
    <div class="dialog">
      <header>
        <h3>{{ title }}</h3>
        <span class="muted">Trascina per spostare · rotella per zoom</span>
      </header>
      <canvas
        ref="canvas" class="preview"
        :style="{ width: PREVIEW + 'px', height: PREVIEW + 'px' }"
        @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @wheel="onWheel"
      />
      <p v-if="error" class="error">{{ error }}</p>
      <label>Zoom <span>{{ Math.round(scale * 100) }}%</span>
        <input v-model.number="scale" type="range" min="0.2" max="6" step="0.01">
      </label>
      <label>Rotazione <span>{{ rot }}°</span>
        <input v-model.number="rot" type="range" min="-180" max="180" step="1">
      </label>
      <div class="row">
        <button @click="fit">Riempi</button>
        <button @click="contain">Tutta dentro</button>
        <span class="spacer" />
        <button @click="emit('cancel')">Annulla</button>
        <button class="primary" :disabled="!img" @click="apply">Applica</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: grid; place-items: center; z-index: 50; padding: 1rem; }
.dialog {
  background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 1rem;
  display: flex; flex-direction: column; gap: 0.8rem; max-width: 100%;
}
header { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
h3 { margin: 0; font-size: 1rem; }
.muted { color: var(--muted); font-size: 0.8rem; }
.preview { border-radius: 10px; touch-action: none; cursor: grab; max-width: 100%; }
.preview:active { cursor: grabbing; }
label { font-size: 0.85rem; }
label span { float: right; color: var(--accent-2); }
.row { display: flex; gap: 0.5rem; align-items: center; }
.spacer { flex: 1; }
.error { color: #ff7b7b; font-size: 0.85rem; margin: 0; }
</style>
