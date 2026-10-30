<script setup lang="ts">
// The reviewer's verdict on a hunk, which also moves on to the next hunk. GitHub has no per-hunk verdict, so it stays local.
const props = defineProps<{ hunkId: string }>()

const BUTTONS = [
  { verdict: 'approved', label: 'Approve', color: 'success' as const },
  { verdict: 'changes', label: 'Request changes', color: 'error' as const },
  { verdict: 'comment', label: 'Comment', color: 'neutral' as const },
]
const mine = computed(() => verdictOf(props.hunkId))
const posted = computed(() => Boolean(postedReview()))
const suggested = computed(() => verdictFromSeverities(standingSeverities(props.hunkId)))

function title(verdict: string, label: string) {
  return `${verdict === suggested.value ? 'Suggested for this hunk. ' : ''}${label} and go to the next hunk. Local only: GitHub has no per-hunk verdict.`
}
</script>

<template>
  <span v-if="posted" class="inline-flex items-center gap-1.5 text-[13px] text-muted">
    <template v-if="mine"><VerdictIcon :verdict="mine" class="size-3.5" />{{ POSTED_HUNK_VERDICTS[mine] }}</template>
    <template v-else>No verdict on this hunk</template>
    · review posted
  </span>
  <span v-else class="inline-flex flex-wrap gap-2" role="group" aria-label="Your verdict on this hunk. Local only: GitHub has no per-hunk verdict.">
    <UButton
      v-for="button in BUTTONS"
      :key="button.verdict"
      :color="button.color"
      :variant="mine === button.verdict ? 'solid' : 'outline'"
      :aria-pressed="mine === button.verdict"
      :title="title(button.verdict, button.label)"
      :class="button.verdict !== suggested && mine !== button.verdict && 'not-hover:not-focus-visible:text-muted not-hover:not-focus-visible:ring-accented'"
      @click="setHunkVerdict(hunkId, button.verdict)"
    >
      <VerdictIcon :verdict="button.verdict" class="size-3.5" />{{ button.label }}<span v-if="button.verdict === suggested" class="sr-only"> (suggested)</span>
    </UButton>
  </span>
</template>
