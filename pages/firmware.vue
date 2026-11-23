<script setup lang="ts">
/**
 * Aggiornare il firmware della dapo: dal browser via Bluetooth (servizio OTA del firmware),
 * dal telefono con la modalità OTA del bootloader, oppure via USB con il file .uf2.
 */
import type { OtaProgress } from '~/composables/useDapoBle'

useHead({ title: 'Firmware · Dapo Twin' })

const REPO = 'https://github.com/MrTartuf0/dapo-twin-led'
const ble = useDapoBle()

interface SiteFirmware { version: string; file: string; size: number; crc32: number; sha256: string }
const site = ref<SiteFirmware | null>(null)
const progress = ref<OtaProgress | null>(null)
const message = ref('')
const error = ref('')
const picked = ref<{ name: string; bytes: Uint8Array } | null>(null)

onMounted(async () => {
  try {
    const r = await fetch('/firmware/latest.json', { cache: 'no-store' })
    if (r.ok) site.value = await r.json()
  } catch { /* in sviluppo locale il firmware non c'è: lo mette la CI */ }
})

const fileBase = computed(() => site.value?.file.replace(/\.bin$/, '') ?? '')
const upToDate = computed(() => !!site.value && ble.info.value?.fw === site.value.version)
const busy = computed(() => ble.otaBusy.value)
const percent = computed(() => progress.value ? Math.round(100 * progress.value.sent / Math.max(1, progress.value.total)) : 0)
const PHASES: Record<string, string> = {
  prepara: 'Preparazione', cancella: 'Cancello l\'area di aggiornamento (circa 10 s)', invia: 'Invio del firmware',
  verifica: 'Controllo del CRC sulla scheda', riavvia: 'La scheda installa e si riavvia', fatto: 'Fatto'
}

async function run(bytes: Uint8Array, label: string) {
  error.value = ''; message.value = ''
  progress.value = { phase: 'prepara', sent: 0, total: bytes.length, kbps: 0 }
  try {
    const back = await ble.updateFirmware(bytes, p => { progress.value = p })
    message.value = back
      ? `Aggiornata a ${ble.info.value?.fw ?? label}.`
      : `Firmware ${label} installato. Riconnetti la scheda per controllare la versione.`
  } catch (e: any) {
    error.value = e?.message || String(e)
    progress.value = null
  }
}

async function updateFromSite() {
  if (!site.value) return
  error.value = ''
  const r = await fetch('/firmware/latest.bin', { cache: 'no-store' })
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.length !== site.value.size || crc32(bytes) !== site.value.crc32) {
    error.value = 'Il file scaricato non corrisponde a firmware.json: ricarica la pagina e riprova.'
    return
  }
  await run(bytes, site.value.version)
}

async function onPick(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  if (!f.name.toLowerCase().endsWith('.bin')) { error.value = 'Serve il file .bin (quello .uf2 è per l\'USB, lo .zip per il telefono).'; return }
  picked.value = { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }
}

async function bootloaderOta() {
  error.value = ''
  if (!confirm('La scheda si riavvia nella modalità di aggiornamento del bootloader e non manda più dati finché non la aggiorni o la riaccendi. Continuo?')) return
  try {
    await ble.sendCommand('u')
    message.value = 'Scheda in modalità aggiornamento: ora usa nRF Connect sul telefono (passi qui sotto).'
  } catch (e: any) { error.value = e?.message || String(e) }
}

const kb = (b: number) => (b / 1024).toFixed(0) + ' KB'
</script>

<template>
  <main class="page">
    <header class="head">
      <AppNav />
      <h1>Firmware della dapo</h1>
      <p class="muted">Tre modi per aggiornare la scheda XIAO nRF52840 Sense: dal browser via Bluetooth, dal telefono, oppure via USB (sempre possibile, anche per il recupero).</p>
    </header>

    <section class="card">
      <h2>La tua scheda</h2>
      <div v-if="!ble.supported()" class="warn">Questo browser non ha Web Bluetooth: apri la pagina con Chrome o Edge su computer o Android. Puoi comunque aggiornare via USB (ultima sezione).</div>
      <div class="row">
        <button v-if="!ble.connected.value" class="primary" :disabled="ble.connecting.value || !ble.supported()" @click="ble.connect()">
          {{ ble.connecting.value ? 'Connessione…' : 'Connetti via Bluetooth' }}
        </button>
        <button v-else :disabled="busy" @click="ble.disconnect()">Disconnetti</button>
        <span v-if="ble.connected.value" class="ok">● {{ ble.deviceName.value }} · {{ ble.hz.value }} Hz</span>
      </div>
      <dl v-if="ble.connected.value" class="facts">
        <dt>Firmware sulla scheda</dt><dd>{{ ble.info.value?.fw ?? 'versione precedente all\'aggiornamento via Bluetooth' }}</dd>
        <dt>Spazio per l'aggiornamento</dt><dd>{{ ble.info.value ? kb(ble.info.value.ota) : '—' }}</dd>
      </dl>
      <p v-if="ble.lastError.value" class="error">{{ ble.lastError.value }}</p>
    </section>

    <section class="card">
      <h2>Aggiorna dal browser <span class="tag">sperimentale</span></h2>
      <p class="muted">Il firmware nuovo arriva in una seconda area della flash, la scheda ne controlla il CRC e solo dopo lo installa. Tieni la dapo vicina e la pagina aperta: ci vuole circa un minuto.</p>
      <div v-if="site" class="row">
        <button class="primary" :disabled="!ble.connected.value || busy" @click="updateFromSite">
          Installa {{ site.version }} ({{ kb(site.size) }})
        </button>
        <span v-if="upToDate" class="ok">la scheda ha già questa versione</span>
      </div>
      <p v-else class="muted">Il firmware dell'ultima versione viene pubblicato qui dalla CI insieme al sito. Puoi anche scegliere un file .bin dalle <a :href="REPO + '/releases'" target="_blank" rel="noopener">release</a>.</p>
      <div class="row">
        <label class="filebtn">Scegli un file .bin<input type="file" accept=".bin" @change="onPick"></label>
        <button v-if="picked" :disabled="!ble.connected.value || busy" @click="run(picked.bytes, picked.name)">Installa {{ picked.name }} ({{ kb(picked.bytes.length) }})</button>
      </div>
      <div v-if="progress" class="progress">
        <div class="bar"><div :style="{ width: percent + '%' }" /></div>
        <span>{{ PHASES[progress.phase] }}<template v-if="progress.phase === 'invia'"> · {{ percent }}% · {{ progress.kbps.toFixed(1) }} KB/s</template></span>
      </div>
      <p v-if="message" class="ok">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
    </section>

    <section class="card">
      <h2>Aggiorna dal telefono (bootloader)</h2>
      <p class="muted">La strada ufficiale del bootloader Adafruit della XIAO, con il suo controllo CRC. Funziona anche con firmware troppo grandi per l'aggiornamento dal browser.</p>
      <ol>
        <li>Sul telefono installa <b>nRF Connect for Mobile</b> (Nordic) oppure <b>Bluefruit Connect</b> (Adafruit).</li>
        <li>Scarica sul telefono il pacchetto <code>-dfu.zip</code>:
          <a v-if="site" :href="`/firmware/${fileBase}-dfu.zip`" download>{{ fileBase }}-dfu.zip</a>
          <template v-else>dalla pagina <a :href="REPO + '/releases/latest'" target="_blank" rel="noopener">Release</a></template>.
        </li>
        <li><button :disabled="!ble.connected.value || busy" @click="bootloaderOta">Riavvia la scheda in modalità aggiornamento</button> (poi questa pagina perde la connessione).</li>
        <li>Nell'app connettiti al dispositivo DFU che compare, scegli <i>DFU</i> e il file .zip.</li>
      </ol>
    </section>

    <section class="card">
      <h2>Via USB: prima installazione e recupero</h2>
      <ol>
        <li>Collega la XIAO al computer con il cavo USB-C.</li>
        <li>Tocca <b>due volte di fila</b> il tastino di reset: compare un disco chiamato <code>XIAO-SENSE</code>.</li>
        <li>Trascina sul disco il file
          <a v-if="site" :href="`/firmware/${fileBase}.uf2`" download>{{ fileBase }}.uf2</a>
          <template v-else><code>.uf2</code> dalla pagina <a :href="REPO + '/releases/latest'" target="_blank" rel="noopener">Release</a></template>.
          Il disco sparisce e la scheda riparte col firmware nuovo.
        </li>
      </ol>
      <p class="muted">Questo funziona sempre, anche se un aggiornamento via Bluetooth si è interrotto a metà.</p>
    </section>
  </main>
</template>

<style scoped>
.page { max-width: 820px; margin: 0 auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.head h1 { margin: 0.8rem 0 0.3rem; font-size: 1.5rem; }
.muted { color: var(--muted); font-size: 0.9rem; margin: 0; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.7rem; }
.card h2 { margin: 0; font-size: 1.05rem; }
.tag { font-size: 0.7rem; color: var(--accent); border: 1px solid var(--accent); border-radius: 99px; padding: 0.05rem 0.45rem; vertical-align: middle; margin-left: 0.4rem; }
.row { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; }
.ok { color: var(--accent-2); font-size: 0.9rem; margin: 0; }
.error { color: #ff7b7b; font-size: 0.9rem; margin: 0; }
.warn { background: rgba(255, 179, 71, 0.1); border: 1px solid rgba(255, 179, 71, 0.4); border-radius: 8px; padding: 0.6rem 0.8rem; font-size: 0.9rem; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: 0.3rem 1rem; margin: 0; font-size: 0.9rem; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.filebtn { border: 1px dashed var(--border); border-radius: 8px; padding: 0.5rem 0.9rem; cursor: pointer; font-size: 0.9rem; }
.filebtn:hover { border-color: var(--accent); }
.filebtn input { display: none; }
.progress { display: flex; flex-direction: column; gap: 0.35rem; font-size: 0.85rem; color: var(--muted); }
.bar { height: 8px; background: var(--bg); border: 1px solid var(--border); border-radius: 99px; overflow: hidden; }
.bar div { height: 100%; background: linear-gradient(90deg, var(--accent), var(--accent-2)); transition: width 0.2s; }
ol { margin: 0; padding-left: 1.2rem; display: flex; flex-direction: column; gap: 0.45rem; font-size: 0.92rem; }
a { color: var(--accent-2); }
code { background: var(--bg); padding: 0.05rem 0.35rem; border-radius: 4px; }
</style>
