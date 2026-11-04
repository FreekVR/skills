export default defineNuxtConfig({
  modules: ['@nuxt/ui', '@nuxt/fonts', '@comark/nuxt', '@vueuse/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],
  ssr: false,
  devtools: { enabled: false },
  // The build is committed, so it carries no source maps.
  sourcemap: { server: false, client: false },
  css: ['~/assets/css/main.css'],
  app: { head: { link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] } },
  compatibilityDate: '2026-10-30',
  // Icons ship inside the build, so the page needs no network for them.
  icon: { serverBundle: { collections: ['lucide'] }, clientBundle: { scan: true } },
  // Overpass is fetched at build time and ships inside the build, so the page needs no network for it.
  fonts: { families: [{ name: 'Overpass', provider: 'google', weights: [700, 800, 900] }], defaults: { weights: [700, 800, 900] } },
  // The theme tokens in main.css follow data-theme, as on the single-file page.
  colorMode: { dataValue: 'theme', classSuffix: '' },
  eslint: { config: { stylistic: false } },
})
