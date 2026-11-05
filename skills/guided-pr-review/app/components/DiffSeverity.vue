<script lang="ts">
// One class list for each of the four levels of severityLevel(): the tag takes the colour of its level, from main.css.
export const SEVERITY_CLASSES = [
  'border-transparent bg-sev-0 text-[#121110]',
  'border-transparent bg-sev-1 text-[#121110]',
  'border-transparent bg-sev-2 text-[#121110]',
  'border-transparent bg-sev-3 text-white font-extrabold dark:text-[#121110]',
]
// A note on the diff: a white block with a thick edge on its right; SEVERITY_EDGES colours that edge per level.
export const NOTE_BLOCK = 'relative border-r-8 bg-default px-5 pt-4 pb-4.5 font-sans whitespace-normal'
export const SEVERITY_EDGES = ['border-r-sev-0', 'border-r-sev-1', 'border-r-sev-2', 'border-r-sev-3']
</script>

<script setup lang="ts">
// The severity of a remark.
const props = defineProps<{ severity: string }>()

const level = computed(() => severityLevel(props.severity))
</script>

<template>
  <span class="rounded border px-1.5 py-1 font-mono text-meta leading-none font-bold lowercase" :class="SEVERITY_CLASSES[level]">{{ severity }}</span>
</template>
