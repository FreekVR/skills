<script setup lang="ts">
// One review on GitHub with its comment threads, from reviewCard in panels.js. The current review holds the update.
const props = defineProps<{ review: { id: number, author: string, state: string, submittedAt?: string, url?: string, body?: string }, current: boolean }>()

const STATE_COLORS: Record<string, string> = { approved: 'text-success', changes: 'text-error' }
const card = computed(() => reviewCard(props.review, props.current))

function onToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (open !== card.value.open) state.ui.terminusOpen = { ...state.ui.terminusOpen, [card.value.key]: open }
}
</script>

<template>
  <details class="mt-3 rounded-[10px] border border-default bg-default" :open="card.open" @toggle="onToggle">
    <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-2.5 gap-y-2 px-4 py-3">
      <UAvatar :src="avatar(review.author)" alt="" size="xs" loading="lazy" class="shrink-0 ring-1 ring-default" />
      <b>{{ card.mine ? 'You' : `@${review.author}` }}</b>
      <span v-if="current" class="text-xs font-semibold">current</span>
      <span class="inline-flex items-center gap-1.25 text-[13.5px] font-semibold" :class="STATE_COLORS[card.kind.icon]">
        <VerdictIcon :verdict="card.kind.icon" class="size-3.5" />{{ card.kind.label }}
      </span>
      <span v-if="review.submittedAt" class="text-[13px] text-dimmed">{{ timeLabel(review.submittedAt) }}</span>
      <span class="ml-auto text-[13.5px] text-toned">{{ plural(card.comments.length, 'comment') }}{{ card.toCheck ? ` · ${card.toCheck} to check` : '' }}</span>
    </summary>
    <div class="border-t border-default px-4 pb-4">
      <div v-if="review.body" class="mt-3">
        <SafeMarkdown :value="review.body" />
      </div>
      <p v-if="review.url">
        <a :href="review.url" target="_blank" rel="noopener" class="text-info underline underline-offset-3">Open on GitHub</a>
      </p>
      <ThreadCard v-for="comment in card.comments" :key="comment.id" :comment="comment" :mine="card.mine" />
      <ReviewsUpdateFooter v-if="card.footer" :footer="card.footer" />
    </div>
  </details>
</template>

<style scoped>
summary::-webkit-details-marker { display: none; }
</style>
