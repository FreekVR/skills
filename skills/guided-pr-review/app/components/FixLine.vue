<script setup lang="ts">
// The AI's check whether a commit dealt with a comment, from fixLine().
const props = defineProps<{ item: { fix?: { verdict: string, note?: string }, resolved?: boolean } }>()

// The status icon shows the answer at a glance: a check when fixed, the changes icon when not.
const STATUS: Record<string, { icon: string, color: string }> = {
  'fixed': { icon: 'approved', color: 'bg-success' },
  'not-fixed': { icon: 'changes', color: 'bg-error' },
  'unclear': { icon: 'undecided', color: 'bg-(--ui-text-muted)' },
}
const line = computed(() => fixLine(props.item))
const status = computed(() => (line.value ? STATUS[line.value.verdict] || STATUS.unclear : null))
</script>

<template>
  <p v-if="line && status" class="mt-2.5 mb-0 flex max-w-[76ch] items-start gap-2.5 text-ui text-toned">
    <span class="mt-px grid size-5 shrink-0 place-items-center rounded-full text-inverted" :class="status.color" aria-hidden="true">
      <VerdictIcon :verdict="status.icon" class="size-3" />
    </span>
    <span><AiTag label="" class="mr-1.5" /><b class="font-semibold text-default">AI on the code: <span :class="{ 'text-success': line.verdict === 'fixed', 'text-error': line.verdict === 'not-fixed' }">{{ line.label }}</span>.</b> <MarkupText :text="line.note" /></span>
  </p>
</template>
