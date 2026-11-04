<script setup lang="ts">
// The AI's recommendation for a hunk, which follows from its findings, and the button for a remark on the whole hunk.
const props = defineProps<{ hunk: { id: string, lines: string[] } }>()

const result = computed(() => advice(props.hunk))
// The recommendation is a field in its colour: red for changes, green for ok, quiet grey for feedback.
const TONES: Record<string, { box: string, title: string }> = {
  changes: { box: 'bg-[color-mix(in_srgb,var(--ui-error)_12%,var(--ui-bg))]', title: 'text-error' },
  feedback: { box: 'bg-elevated', title: '' },
  ok: { box: 'bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--ui-bg))]', title: 'text-success' },
}
</script>

<template>
  <div class="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-card px-4.5 py-3.5" :class="TONES[result.kind]?.box">
    <p class="m-0 text-ui"><AiTag label="" class="mr-1.5" /><strong :class="TONES[result.kind]?.title">AI recommendation: {{ result.title }}.</strong> {{ result.text }}</p>
    <div v-if="result.canRemark" class="flex flex-wrap items-center gap-2.5">
      <UButton color="neutral" variant="solid" class="font-bold" @click="remarkOnHunk(hunk.id)">Add a remark on this hunk</UButton>
      <span class="text-label text-muted">or drag over line numbers to comment on those lines</span>
    </div>
  </div>
</template>
