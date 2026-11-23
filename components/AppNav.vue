<script setup lang="ts">
/** barra di navigazione comune: simulatore, firmware, Lab, GitHub */
const route = useRoute()
const REPO = 'https://github.com/MrTartuf0/dapo-twin-led'
</script>

<template>
  <nav class="nav">
    <NuxtLink to="/" :class="{ on: route.path === '/' }">Simulatore</NuxtLink>
    <NuxtLink to="/firmware" :class="{ on: route.path.startsWith('/firmware') }">Firmware</NuxtLink>
    <a href="/lab/" title="Strumento per la scheda: grafici, registrazione dataset, anteprima LED">Lab</a>
    <a :href="REPO" target="_blank" rel="noopener" title="Codice, issue e release del firmware">GitHub ↗</a>
  </nav>
</template>

<style scoped>
.nav { display: flex; gap: 0.3rem; flex-wrap: wrap; font-size: 0.85rem; }
.nav a { color: var(--muted); text-decoration: none; padding: 0.25rem 0.55rem; border-radius: 6px; border: 1px solid transparent; }
.nav a:hover { color: var(--text); border-color: var(--border); }
.nav a.on { color: var(--accent); border-color: var(--border); background: var(--panel); }
</style>
