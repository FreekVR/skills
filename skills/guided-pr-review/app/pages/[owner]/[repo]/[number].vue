<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()
const main = useTemplateRef<HTMLElement>('main')

setReviewPath(route.params.owner, route.params.repo, route.params.number)
onMounted(boot)
onBeforeUnmount(stopPolling)

useHead({ title: () => (state.review ? `${viewTitle()} · ${state.review.pr.title}` : 'Guided PR review') })

// The reviewer's theme choice is part of their saved review state.
watchEffect(() => {
  if (state.reviewer) colorMode.preference = state.reviewer.theme || 'system'
})

// A new view starts at its top, with the focus on its heading, as the single-file page did.
watch(() => state.view, async (view, before) => {
  if (!before || JSON.stringify(view) === JSON.stringify(before)) return
  await nextTick()
  main.value?.scrollTo({ top: 0 })
  document.querySelector<HTMLElement>('header h1')?.focus()
})

// A key in a text field is typing, not a shortcut, and an open dialog keeps its keys.
useEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target as HTMLElement
  if (state.ui.shortcutsOpen || state.ui.wholeFile || event.metaKey || event.ctrlKey || event.altKey || target.closest('input, textarea, select, [contenteditable]')) return
  if (handleShortcut(event.key)) event.preventDefault()
})
</script>

<template>
  <div v-if="state.bootError" class="p-8">
    {{ state.bootError }}
  </div>
  <div v-else-if="state.review && state.reviewer" class="grid h-dvh grid-cols-[340px_minmax(0,1fr)] grid-rows-[auto_1fr] max-md:h-auto max-md:grid-cols-1">
    <a href="#main" class="sr-only focus:not-sr-only">Skip to the content</a>
    <ReviewStrip class="md:col-start-2 md:row-start-1" />
    <ReviewRail class="md:col-start-1 md:row-span-2 md:row-start-1" />
    <main id="main" ref="main" tabindex="-1" class="relative overflow-x-clip overflow-y-auto md:col-start-2 md:row-start-2">
      <ReviewUpdates />
      <HomeView v-if="state.view.kind === 'home'" />
      <TerminusView v-else-if="state.view.kind === 'terminus'" />
      <ReviewsView v-else-if="state.view.kind === 'reviews'" />
      <StationView v-else />
    </main>
    <ReviewNotices />
    <ShortcutsModal />
  </div>
</template>
