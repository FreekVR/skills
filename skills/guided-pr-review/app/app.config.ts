export default defineAppConfig({
  ui: {
    // The type scale in main.css: without this, Nuxt UI merges text-label and the like as colours and drops one of them.
    tv: { twMergeConfig: { extend: { theme: { text: ['tag', 'meta', 'label', 'ui', 'body', 'lead', 'title', 'display'] } } } },
  },
})
