<script setup lang="ts">
// The AI's recommendation for a hunk, which follows from its findings, and the button for a remark on the whole hunk.
const props = defineProps<{ hunk: { id: string, lines: string[] } }>()

const result = computed(() => advice(props.hunk))
const TONES: Record<string, { box: string, title: string }> = {
  changes: { box: 'border-error', title: 'text-error' },
  feedback: { box: 'border-accented', title: '' },
  ok: { box: 'border-accented', title: 'text-success' },
}
</script>

<template>
  <div class="mt-7 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-lg border px-3.5 py-2.5" :class="TONES[result.kind]?.box">
    <p class="m-0 text-sm"><strong :class="TONES[result.kind]?.title">AI recommendation: {{ result.title }}.</strong> {{ result.text }}</p>
    <div v-if="result.canRemark" class="flex flex-wrap items-center gap-2.5">
      <UButton color="neutral" variant="soft" @click="remarkOnHunk(hunk.id)">Add a remark on this hunk</UButton>
      <span class="text-[12.5px] text-muted">or drag over line numbers to comment on those lines</span>
    </div>
  </div>
</template>
