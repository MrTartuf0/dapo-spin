<script setup lang="ts">
/** LED simulati: si accendono a parte, così lo stesso design si prova con e senza LED */
const led = useLedSettings()
</script>

<template>
  <section class="card">
    <div class="head">
      <h3>LED</h3>
      <label class="switch"><input v-model="led.on.value" type="checkbox"><span>{{ led.on.value ? 'accesi' : 'spenti' }}</span></label>
    </div>
    <p class="hint">{{ led.on.value ? 'La luce si somma al design, su tutte e due le facce.' : 'Spenti: vedi il design come su una dapo senza LED.' }}</p>
    <template v-if="led.on.value">
      <div class="row">
        <select v-model="led.layout.value" title="Dove sono cuciti">
          <option v-for="l in LED_LAYOUTS" :key="l.id" :value="l.id">{{ l.label }}</option>
        </select>
        <select v-model="led.effect.value" title="Effetto">
          <option v-for="e in LED_EFFECTS" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </div>
      <label class="slider">Diffusione nel tessuto <span>{{ led.diffuseCm.value.toFixed(1) }} cm</span>
        <input v-model.number="led.diffuseCm.value" type="range" min="0.8" max="6" step="0.1">
      </label>
      <label class="check"><input v-model="led.night.value" type="checkbox"> Al buio (scurisce la scena)</label>
    </template>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 0.65rem; }
.head { display: flex; align-items: center; justify-content: space-between; }
h3 { margin: 0; font-size: 0.95rem; }
.hint { color: var(--muted); font-size: 0.82rem; margin: 0; }
.row { display: flex; gap: 0.45rem; flex-wrap: wrap; }
select { font: inherit; font-size: 0.85rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 0.3rem 0.5rem; flex: 1; min-width: 140px; }
.slider { font-size: 0.82rem; }
.slider span { float: right; color: var(--accent-2); }
.check { font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: center; }
.switch { display: flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--muted); cursor: pointer; }
.switch input { accent-color: var(--accent); width: 1.1rem; height: 1.1rem; }
</style>
