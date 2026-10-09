<script setup lang="ts">
const { designs, activeId, active, load, add, remove, update } = useDapoDesigns()

const name = ref('')
const frontFile = ref<string | null>(null)
const backFile = ref<string | null>(null)
const error = ref('')

/* editor della cornice: a quale lato / design è destinato il risultato */
const editing = ref<{ file: File; side: 'front' | 'back'; designId?: string } | null>(null)

onMounted(load)

const previewFront = computed(() => active.value?.front ?? frontFile.value ?? DEFAULT_FRONT)
const previewBack = computed(() => active.value?.back ?? backFile.value ?? DEFAULT_BACK)

function openEditor(side: 'front' | 'back', e: Event, designId?: string) {
  error.value = ''
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
  if (!isSvg && !file.type.startsWith('image/')) { error.value = 'Carica un SVG o un\'immagine (PNG, JPG, WebP)'; return }
  editing.value = { file, side, designId }
}

function onApply(dataUrl: string) {
  const ed = editing.value
  if (!ed) return
  if (ed.designId) update(ed.designId, { [ed.side]: dataUrl })
  else if (ed.side === 'front') frontFile.value = dataUrl
  else backFile.value = dataUrl
  if (!ed.designId) activeId.value = null
  editing.value = null
}

function save() {
  if (!frontFile.value || !backFile.value) {
    error.value = 'Carica sia il fronte che il retro'
    return
  }
  add({ name: name.value.trim() || `Dapo ${designs.value.length + 1}`, front: frontFile.value, back: backFile.value })
  name.value = ''
  frontFile.value = backFile.value = null
}

function clearDraft() {
  frontFile.value = backFile.value = null
  activeId.value = null
}

const editorTitle = computed(() => editing.value ? (editing.value.side === 'front' ? 'Fronte' : 'Retro') + ' — posiziona nella cornice' : '')
</script>

<template>
  <main class="layout">
    <aside class="sidebar">
      <h1>Dapo Spin</h1>
      <p class="hint">Carica un'immagine per lato (SVG, PNG, JPG…): la posizioni nella cornice e viene rasterizzata nella forma del dapo.</p>

      <section class="card">
        <h2>Nuovo dapo</h2>
        <input v-model="name" class="text" type="text" placeholder="Nome (opzionale)">

        <label class="file" :class="{ ok: frontFile }">
          <span>Fronte</span>
          <input type="file" accept="image/*,.svg" @change="openEditor('front', $event)">
          <img v-if="frontFile" :src="frontFile" alt="">
        </label>
        <label class="file" :class="{ ok: backFile }">
          <span>Retro</span>
          <input type="file" accept="image/*,.svg" @change="openEditor('back', $event)">
          <img v-if="backFile" :src="backFile" alt="">
        </label>

        <p v-if="error" class="error">{{ error }}</p>
        <div class="row">
          <button class="primary" @click="save">Salva dapo</button>
          <button @click="clearDraft">Pulisci</button>
        </div>
      </section>

      <section class="card" v-if="designs.length">
        <h2>I tuoi dapi</h2>
        <ul class="list">
          <li v-for="d in designs" :key="d.id" :class="{ active: d.id === activeId }">
            <button class="pick" @click="activeId = d.id">
              <img :src="d.front" alt=""><img :src="d.back" alt="">
              <span>{{ d.name }}</span>
            </button>
            <div class="mini">
              <label title="Sostituisci fronte">F<input type="file" accept="image/*,.svg" @change="openEditor('front', $event, d.id)"></label>
              <label title="Sostituisci retro">R<input type="file" accept="image/*,.svg" @change="openEditor('back', $event, d.id)"></label>
              <button class="del" title="Elimina" @click="remove(d.id)">✕</button>
            </div>
          </li>
        </ul>
      </section>
    </aside>

    <section class="main">
      <header class="top">
        <h2>{{ active?.name ?? (frontFile || backFile ? 'Anteprima' : 'Esempio') }}</h2>
        <span class="muted">Click/Spazio = flick + lancio · D = giro di dito · F = gira lato</span>
      </header>
      <DapoViewer :front="previewFront" :back="previewBack" />
    </section>

    <DapoFrameEditor
      v-if="editing"
      :file="editing.file"
      :title="editorTitle"
      @apply="onApply"
      @cancel="editing = null"
    />
  </main>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: 100vh;
}
@media (max-width: 820px) { .layout { grid-template-columns: 1fr; } }

.sidebar {
  padding: 1.5rem;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}
h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.02em; }
h2 { margin: 0 0 0.8rem; font-size: 1rem; }
.hint, .muted { color: var(--muted); font-size: 0.85rem; margin: 0; }

.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.text {
  font: inherit;
  padding: 0.5rem 0.7rem;
  background: var(--bg);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 8px;
}

.file {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0.8rem;
  border: 1px dashed var(--border);
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.9rem;
}
.file:hover { border-color: var(--accent); }
.file.ok { border-style: solid; border-color: var(--accent-2); }
.file input { display: none; }
.file img { width: 36px; height: 36px; margin-left: auto; clip-path: var(--star); object-fit: cover; }

.row { display: flex; gap: 0.5rem; }
.error { color: #ff7b7b; font-size: 0.85rem; margin: 0; }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.list li { display: flex; align-items: center; gap: 0.4rem; border-radius: 10px; padding: 0.25rem; }
.list li.active { background: rgba(255,179,71,0.12); }
.pick {
  flex: 1; display: flex; align-items: center; gap: 0.4rem;
  border: none; background: none; padding: 0.3rem; text-align: left;
}
.pick img { width: 30px; height: 30px; clip-path: var(--star); object-fit: cover; }
.pick span { margin-left: 0.3rem; font-size: 0.9rem; }
.mini { display: flex; gap: 0.25rem; }
.mini label, .mini .del {
  width: 26px; height: 26px; display: grid; place-items: center;
  font-size: 0.7rem; border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; background: var(--bg); color: var(--muted); padding: 0;
}
.mini input { display: none; }
.mini .del:hover { color: #ff7b7b; border-color: #ff7b7b; }

.main { padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.top { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
.top h2 { margin: 0; font-size: 1.2rem; }
</style>
