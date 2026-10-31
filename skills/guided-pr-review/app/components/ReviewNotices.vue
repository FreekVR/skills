<script setup lang="ts">
// Shows the messages of notify.js as toasts. A toast the reviewer closes leaves the list; a message that leaves the
// list, for example after its five seconds, closes its toast.
const toast = useToast()
const shown = new Set<number>()

watch(() => notices.map((notice: { id: number }) => notice.id), (ids: number[]) => {
  for (const notice of notices) {
    if (shown.has(notice.id)) continue
    shown.add(notice.id)
    toast.add({
      id: notice.id,
      title: notice.message,
      color: notice.isError ? 'error' : 'neutral',
      type: notice.isError ? 'foreground' : 'background',
      duration: 0,
      progress: false,
      close: { 'aria-label': 'Close this message' },
      ui: {
        root: notice.isError ? 'bg-error ring-0' : 'bg-(--ui-text) ring-0',
        title: (notice.isError ? 'text-inverted' : 'text-(--ui-bg)') + ' font-normal text-ui',
        close: notice.isError ? 'text-inverted' : 'text-(--ui-bg)',
      },
      'onUpdate:open': (open: boolean) => { if (!open) dismissNotice(notice.id) },
    })
  }
  for (const id of shown) {
    if (ids.includes(id)) continue
    shown.delete(id)
    toast.remove(id)
  }
}, { immediate: true })
</script>

<template>
  <span class="hidden" />
</template>
