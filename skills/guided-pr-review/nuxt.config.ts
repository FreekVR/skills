export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@comark/nuxt', '@vueuse/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  compatibilityDate: '2026-10-30',
  // Icons ship inside the build, so the page needs no network for them.
  icon: { serverBundle: { collections: ['lucide'] }, clientBundle: { scan: true } },
  // Fonts would be fetched from Google at build time; the page uses system fonts.
  ui: { fonts: false },
  eslint: { config: { stylistic: false } },
})
