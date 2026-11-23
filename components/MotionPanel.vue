<script setup lang="ts">
/** scegli da dove arriva il movimento: fisica, gesture predefinite, dapo vero, registrazione */
import type { MotionMode } from '~/composables/useMotion'

const motion = useMotion()
const ble = useDapoBle()
const error = ref('')
const MODES: { id: MotionMode; label: string; hint: string }[] = [
  { id: 'fisica', label: 'Fisica', hint: 'Il modello fisico del simulatore: usa i pulsanti sotto (flick, pinch, boomerang…).' },
  { id: 'gesture', label: 'Gesture', hint: 'Movimenti predefiniti: per vedere un design in azione senza avere la scheda.' },
  { id: 'live', label: 'Dapo vero', hint: 'La tua dapo con la XIAO, via Bluetooth: i movimenti sono i tuoi.' },
  { id: 'file', label: 'Registrazione', hint: 'Un CSV registrato con il Dapo Lab, rigiocato con il design attivo.' }
]
const hint = computed(() => MODES.find(m => m.id === motion.mode.value)?.hint)
const clip = computed(() => motion.currentClip())
const progress = ref(0)
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { const c = clip.value; progress.value = c ? motion.playhead.value / c.duration : 0 }, 100) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

async function connect() {
  error.value = ''
  await ble.connect()
  if (ble.connected.value) motion.setMode('live')
}
async function cmd(c: string) {
  try { await ble.sendCommand(c) } catch (e: any) { error.value = e?.message || String(e) }
}
async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  error.value = ''
  try { await motion.loadCsv(f) } catch (err: any) { error.value = err?.message || String(err) }
}
</script>

<template>
  <section class="card">
    <h3>Movimento</h3>
    <div class="tabs">
      <button v-for="m in MODES" :key="m.id" :class="{ on: motion.mode.value === m.id }" @click="motion.setMode(m.id)">{{ m.label }}</button>
    </div>
    <p class="hint">{{ hint }}</p>

    <template v-if="motion.mode.value === 'gesture'">
      <div class="chips">
        <button v-for="c in motion.gestureClips()" :key="c.id" :class="{ on: clip?.id === c.id }" @click="motion.selectClip(c.id)">{{ c.name }}</button>
      </div>
    </template>

    <template v-if="motion.mode.value === 'file'">
      <label class="filebtn">Carica un CSV del Dapo Lab<input type="file" accept=".csv,text/csv" @change="onFile"></label>
      <select v-if="motion.fileClips.value.length" :value="clip?.id" @change="motion.selectClip(($event.target as HTMLSelectElement).value)">
        <option v-for="c in motion.fileClips.value" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
    </template>

    <div v-if="(motion.mode.value === 'gesture' || motion.mode.value === 'file') && clip" class="row">
      <button @click="motion.playing.value = !motion.playing.value">{{ motion.playing.value ? '❚❚ Pausa' : '▶ Play' }}</button>
      <select v-model.number="motion.speed.value" title="Velocità">
        <option :value="0.25">0,25×</option><option :value="0.5">0,5×</option><option :value="1">1×</option><option :value="2">2×</option>
      </select>
      <div class="bar"><div :style="{ width: (progress * 100).toFixed(1) + '%' }" /></div>
      <button title="La punta +X torna verso destra" @click="motion.zero()">Zero</button>
    </div>

    <template v-if="motion.mode.value === 'live'">
      <div class="row">
        <button v-if="!ble.connected.value" class="primary" :disabled="ble.connecting.value" @click="connect">
          {{ ble.connecting.value ? 'Connessione…' : 'Connetti la dapo' }}
        </button>
        <template v-else>
          <span class="ok">● {{ ble.deviceName.value }} · {{ ble.hz.value }} Hz · {{ ble.info.value?.fw ?? 'firmware senza versione' }}</span>
        </template>
      </div>
      <div v-if="ble.connected.value" class="row">
        <button title="Riallinea la rotazione attorno alla verticale" @click="motion.zero()">Zero</button>
        <button title="Tieni ferma la dapo ~1 s" @click="cmd('c')">Calibra gyro</button>
        <button title="Orientamento dalla gravità" @click="cmd('r')">Livella</button>
        <button @click="ble.disconnect()">Disconnetti</button>
      </div>
      <p v-if="ble.connected.value && !ble.info.value" class="hint">Il firmware della scheda è vecchio: aggiornalo dalla pagina <NuxtLink to="/firmware">Firmware</NuxtLink>.</p>
      <p v-if="!ble.supported()" class="error">Questo browser non ha Web Bluetooth: usa Chrome o Edge (computer o Android).</p>
      <p v-if="ble.lastError.value" class="error">{{ ble.lastError.value }}</p>
    </template>
    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; }
h3 { margin: 0; font-size: 0.95rem; }
.hint { color: var(--muted); font-size: 0.82rem; margin: 0; }
.tabs { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.tabs button, .chips button { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
.tabs .on, .chips .on { border-color: var(--accent-2); color: var(--accent-2); }
.chips { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.chips button { border-radius: 99px; }
.row { display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; }
.row button { padding: 0.35rem 0.7rem; font-size: 0.85rem; }
select { font: inherit; font-size: 0.85rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 0.3rem 0.5rem; }
.bar { flex: 1; min-width: 80px; height: 6px; background: var(--bg); border: 1px solid var(--border); border-radius: 99px; overflow: hidden; }
.bar div { height: 100%; background: var(--accent-2); }
.filebtn { border: 1px dashed var(--border); border-radius: 8px; padding: 0.45rem 0.8rem; cursor: pointer; font-size: 0.85rem; align-self: flex-start; }
.filebtn:hover { border-color: var(--accent); }
.filebtn input { display: none; }
.ok { color: var(--accent-2); font-size: 0.85rem; }
.error { color: #ff7b7b; font-size: 0.85rem; margin: 0; }
a { color: var(--accent-2); }
</style>
