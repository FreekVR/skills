<script setup lang="ts">
// The reviewer's verdict on a hunk, which also moves on to the next hunk. GitHub has no per-hunk verdict, so it stays local.
// With `group`, the verdict is on all generated files at once.
const props = defineProps<{ hunkId?: string, group?: boolean }>()

const BUTTONS = [
  { verdict: 'approved', label: 'Approve', color: 'success' as const },
  { verdict: 'changes', label: 'Request changes', color: 'error' as const },
  { verdict: 'comment', label: 'Comment', color: 'neutral' as const },
]
const mine = computed(() => (props.group ? groupVerdict() : verdictOf(props.hunkId!)))
const posted = computed(() => Boolean(postedReview()))
const suggested = computed(() => verdictFromSeverities(props.group ? groupSeverities() : standingSeverities(props.hunkId!)))
const files = computed(() => (props.group ? generatedFiles().length : 0))
const groupLabel = computed(() => (props.group ? `Your verdict on all ${files.value} files. Local only: GitHub has no verdict per file.` : 'Your verdict on this hunk. Local only: GitHub has no per-hunk verdict.'))
const postedText = computed(() => {
  if (!mine.value) return props.group ? 'No verdict on these files' : 'No verdict on this hunk'
  return props.group ? `Your verdict on all ${files.value} files: ${verdictWord(mine.value)}` : POSTED_HUNK_VERDICTS[mine.value]
})

interface SharedFile { path: string, hunkId: string, shared: { line: { name: string, letter: string }, index: number }[] }
// The shared stops whose own verdict makes the group count as more severe than the reviewer's verdict on the group.
const raisedBy = computed(() => {
  const countsAs = props.group ? groupCountsAs() : null
  if (!countsAs || countsAs === groupVerdict()) return ''
  return (generatedFiles() as SharedFile[])
    .filter((file) => file.shared.length && verdictOf(file.hunkId) === countsAs)
    .map(({ path, shared: [first] }) => `${stationCode(first!.line, first!.index)} ${path} in ${first!.line.name}`)
    .join(', ')
})

// A shared hunk's verdict that is more severe than the group's own makes the group count as that verdict; the group's own verdict stays as it is.
const raisesGroup = computed(() => !props.group && isGenerated(props.hunkId!) && Boolean(mine.value) && groupCountsAs() !== groupVerdict() && mine.value === groupCountsAs())

function title(verdict: string, label: string) {
  if (props.group) return `${verdict === suggested.value ? 'Suggested for these files. ' : ''}${label} for all ${files.value} files and go on. Local only: GitHub has no verdict per file.`
  return `${verdict === suggested.value ? 'Suggested for this hunk. ' : ''}${label} and go to the next hunk. Local only: GitHub has no per-hunk verdict.`
}

function choose(verdict: string) {
  if (props.group) setGeneratedVerdict(verdict)
  else setHunkVerdict(props.hunkId, verdict)
}
</script>

<template>
  <span v-if="posted" class="inline-flex items-center gap-1.5 text-label text-muted">
    <VerdictIcon v-if="mine" :verdict="mine" class="size-3.5" />{{ postedText }}
    · review posted
  </span>
  <!-- Beside the buttons, so the effect on the group is not a surprise. -->
  <p v-if="raisesGroup && !posted" class="m-0 ml-auto flex items-center gap-2 self-center text-ui text-toned" data-group-hint>
    <VerdictIcon :verdict="mine!" class="size-4" /><span>{{ `Counts as ${verdictWord(mine)} for the group` }}</span>
  </p>
  <span v-if="!posted" class="inline-flex flex-wrap gap-2" role="group" :aria-label="groupLabel">
    <UButton
      v-for="button in BUTTONS"
      :key="button.verdict"
      :color="button.color"
      :variant="mine === button.verdict ? 'solid' : button.verdict === suggested ? 'subtle' : 'ghost'"
      size="lg"
      :aria-pressed="mine === button.verdict"
      :title="title(button.verdict, button.label)"
      class="font-display text-ui"
      :class="button.verdict !== suggested && mine !== button.verdict && 'not-hover:not-focus-visible:text-toned'"
      @click="choose(button.verdict)"
    >
      <VerdictIcon :verdict="button.verdict" class="size-3.5" />{{ button.label }}<span v-if="button.verdict === suggested" class="sr-only"> (suggested)</span>
    </UButton>
  </span>
  <!-- The icon box is one line high, so the icon stays on the first line when the text wraps. -->
  <p v-if="raisedBy" class="m-0 flex basis-full items-start gap-2 text-ui text-toned" data-counts-as>
    <span class="flex h-[1.5em] shrink-0 items-center"><VerdictIcon :verdict="groupCountsAs()" class="size-4" /></span>
    <span>{{ countsAsLabel() }}, because of your verdict on {{ raisedBy }}.</span>
  </p>
</template>
