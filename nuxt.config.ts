export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-01-01',
  app: {
    head: {
      title: 'Dapo Spin',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }]
    }
  },
  css: ['~/assets/main.css']
})
