<script lang="ts">
// One class list for each of the four levels of severityLevel(): the colour gets stronger with the severity.
export const SEVERITY_CLASSES = [
  'border-accented text-muted',
  'border-(--ui-text-toned) text-default',
  'border-(--ui-text-toned) bg-(--ui-text-toned) text-(--ui-bg)',
  'border-(--ui-text) bg-(--ui-text) text-(--ui-bg) font-extrabold',
]
</script>

<script setup lang="ts">
// The severity of a remark.
const props = defineProps<{ severity: string }>()

const level = computed(() => severityLevel(props.severity))
</script>

<template>
  <span class="rounded border px-1.5 py-[3px] font-mono text-[11.5px] leading-none font-semibold lowercase" :class="SEVERITY_CLASSES[level]">{{ severity }}</span>
</template>
