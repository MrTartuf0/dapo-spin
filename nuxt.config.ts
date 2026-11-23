export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-01-01',
  app: {
    head: {
      title: 'Dapo Twin',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  css: ['~/assets/main.css'],
  // pagine generate come file statici (Netlify): il simulatore e la pagina Firmware
  nitro: { prerender: { routes: ['/', '/firmware'] } }
})
