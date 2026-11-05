<script setup lang="ts">
// The icon of a verdict name: approved, changes, comment or undecided.
const props = defineProps<{ verdict: string }>()

const ICONS: Record<string, string> = {
  approved: 'i-lucide-check',
  changes: 'i-lucide-file-diff',
  comment: 'i-lucide-message-square',
  undecided: 'i-lucide-circle-dashed',
}
</script>

<template>
  <UIcon :name="ICONS[props.verdict] || ICONS.comment" aria-hidden="true" />
</template>
