<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'

// One review in the sessions list: a link to its page, when it was last active, its agent's pause button,
// and a remove button that asks first. A review whose agent runs, and the review of this page, cannot be removed.
interface Review { owner: string, repo: string, number: number, title: string, state: string, paused: boolean, agentConnected: boolean, lastActivity?: string, session?: unknown }
const props = defineProps<{ review: Review }>()

const current = computed(() => isCurrentReview(props.review))
const suffix = computed(() => (props.review.state === 'open' ? '' : ` · ${props.review.state}`))
const when = computed(() => (props.review.lastActivity ? formatTimeAgo(new Date(props.review.lastActivity)) : ''))
const confirming = ref(false)
const error = ref('')

async function remove() {
  error.value = ''
  try {
    await removeSession(props.review)
  } catch (failure) {
    confirming.value = false
    error.value = (failure as Error).message
  }
}
</script>

<template>
  <li
    class="rounded-md text-label"
    :class="current ? 'mb-1 bg-accented px-2.5 py-2' : 'has-[a:hover]:bg-elevated'"
    :aria-current="current ? 'page' : undefined"
  >
    <div class="flex items-start gap-1">
      <div class="min-w-0 flex-1">
        <template v-if="current">
          <span class="flex flex-wrap items-center gap-x-1.5 font-semibold">
            <UIcon name="i-lucide-check" class="size-3.5 text-success" aria-hidden="true" /><a :href="state.review.pr.url" target="_blank" rel="noopener" class="text-info underline-offset-3">{{ reviewRef(review) }}</a>{{ suffix }}
            <span class="rounded-sm bg-(--ui-text) px-1.5 text-tag font-semibold text-inverted">this page</span>
          </span>
          <span class="block text-muted">{{ review.title }}</span>
          <span v-if="review.paused" class="block text-warning">Agent paused</span>
        </template>
        <template v-else>
          <a :href="`/${review.owner}/${review.repo}/${review.number}`" class="grid gap-0.5 px-2.5 py-2 text-default no-underline">
            <span class="flex items-baseline justify-between gap-2">
              <span class="font-semibold">{{ reviewRef(review) }}{{ suffix }}</span>
              <span class="shrink-0 text-meta text-muted">{{ when }}</span>
            </span>
            <span class="text-muted">{{ review.title }}</span>
            <span v-if="review.paused" class="text-warning">Agent paused</span>
          </a>
          <ResumeHelp v-if="!review.agentConnected" :help="resumeHelp(review)" lead="Not running. " class="px-2.5 pb-2 text-muted" />
        </template>
      </div>
      <UTooltip v-if="review.agentConnected" :text="review.paused ? 'Resume the agent' : 'Pause the agent'">
        <UButton
          :icon="review.paused ? 'i-lucide-play' : 'i-lucide-pause'"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          class="mt-1.5 shrink-0"
          :aria-label="`${review.paused ? 'Resume' : 'Pause'} the agent of ${reviewRef(review)}`"
          @click="setPaused(review, !review.paused)"
        />
      </UTooltip>
      <UTooltip v-else-if="!current" text="Remove this review">
        <UButton
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          square
          class="mt-1.5 shrink-0 text-muted hover:text-error"
          :aria-label="`Remove the review of ${reviewRef(review)}`"
          @click="confirming = true"
        />
      </UTooltip>
    </div>
    <div v-if="confirming" class="mx-2.5 mb-2 rounded-md bg-error/10 px-2.5 py-2" role="group" :aria-label="`Remove the review of ${reviewRef(review)}`">
      <p class="m-0 text-default">Delete the review folder of #{{ review.number }} and its worktree?</p>
      <div class="mt-1.5 flex gap-1.5">
        <UButton color="error" size="sm" @click="remove()">Remove</UButton>
        <UButton color="neutral" variant="ghost" size="sm" @click="confirming = false">Cancel</UButton>
      </div>
    </div>
    <p v-if="error" class="mx-2.5 mt-0 mb-2 text-error" role="alert">Not removed: {{ error }}</p>
  </li>
</template>
