<script setup lang="ts">
// The AI's check whether a commit dealt with a comment, from fixLine().
const props = defineProps<{ item: { fix?: { verdict: string, note?: string }, resolved?: boolean } }>()

const VERDICT_COLORS: Record<string, string> = { 'fixed': 'text-success', 'not-fixed': 'text-error' }
const line = computed(() => fixLine(props.item))
</script>

<template>
  <p v-if="line" class="mt-2.5 mb-0 max-w-[76ch] text-ui text-toned">
    <AiTag label="AI check" />
    <b :class="VERDICT_COLORS[line.verdict]">{{ line.label }}.</b> <MarkupText :text="line.note" />
  </p>
</template>
