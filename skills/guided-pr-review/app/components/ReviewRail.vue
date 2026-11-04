<script setup lang="ts">
const SUBMIT_COLORS: Record<string, string> = { approved: 'var(--ui-success)', changes: 'var(--ui-error)', comment: 'var(--ui-text-toned)', undecided: 'var(--ui-text)' }

const total = computed(() => state.review.hunks.length)
const seen = computed(() => total.value - unseenHunks().length)

const flows = computed(() => lines().map((line: { id: string, color: string, stops: { hunkId: string }[] }) => ({
  line,
  decided: line.stops.filter((stop) => verdictOf(stop.hunkId)).length,
  verdict: flowVerdict(line),
  current: state.view.kind === 'station' && state.view.line === line.id,
})))

const reviewCounts = computed(() => {
  const others = othersReviewCount()
  const toCheck = threadsToCheck().length
  return [others ? `${others} by others` : '', toCheck ? needsDecisionLabel(toCheck) : ''].filter(Boolean).join(' · ')
})

const submit = computed(() => {
  const proposal = VERDICTS.find((option) => option.id === proposedVerdict())
  const posted = postedReview()
  const shown = posted ? postedVerdict(posted) : proposal || { icon: 'undecided' }
  return { proposal, posted, shown, accepted: acceptedItems().length }
})

// The current line fills its row with its own colour; the other rows show it on hover.
const itemClass = (current: boolean) => ['w-full items-start gap-2.5 rounded-lg px-2.5 py-2.5 text-left', current ? 'bg-(--ui-text) text-inverted hover:bg-(--ui-text)' : 'text-default hover:bg-accented/60']
</script>

<template>
  <aside class="flex min-h-0 flex-col bg-elevated max-md:order-3" aria-label="Review navigation">
    <div class="px-2.5 pt-4 pb-2">
      <div class="mx-2.5 mb-3.5 grid gap-0.5">
        <a :href="state.review.pr.url" target="_blank" rel="noopener" class="justify-self-start font-mono text-meta font-semibold text-info underline-offset-3">{{ reviewRef(state.review.pr) }}</a>
        <span class="line-clamp-2 text-ui leading-snug font-bold" :title="state.review.pr.title"><MarkupText :text="state.review.pr.title" /></span>
      </div>
      <UButton color="neutral" variant="ghost" :class="itemClass(state.view.kind === 'home')" :aria-current="state.view.kind === 'home'" @click="goHome()">
        <span class="grid size-7 place-items-center rounded-full" :class="state.view.kind === 'home' ? 'bg-(--ui-bg) text-default' : 'bg-(--ui-text) text-inverted'" aria-hidden="true">
          <UIcon name="i-lucide-house" class="size-4" />
        </span>
        <span class="pt-1.5 text-ui leading-none font-semibold">Home</span>
      </UButton>
      <UProgress :model-value="seen" :max="total" size="sm" color="neutral" class="mx-2.5 mt-3.5 w-auto" aria-label="Hunks seen" />
      <p class="mx-2.5 mt-1.5 mb-0 text-meta text-muted">
        {{ seen }} of {{ plural(total, 'hunk') }} seen<template v-if="seen < total">
          · <UButton color="neutral" variant="ghost" size="xs" class="text-toned" @click="nextUnseen()">Next unseen</UButton>
        </template>
      </p>
    </div>

    <div class="relative min-h-0 flex-1 overflow-y-auto max-md:overflow-visible">
      <h2 class="mx-5 mt-4 mb-2 text-tag font-bold tracking-[.12em] text-muted uppercase">Lines</h2>
      <ul role="list" class="m-0 grid list-none gap-0.5 px-2.5 py-0">
        <li v-for="{ line, decided, verdict, current } in flows" :key="line.id">
          <UButton
            color="neutral"
            variant="ghost"
            :class="[itemClass(current), 'grid grid-cols-[28px_1fr_auto] hover:text-current']"
            :style="current ? { '--ui-text': `var(--color-${line.color})` } : undefined"
            :aria-current="current"
            @click="openFlow(line.id)"
          >
            <FlowBullet :line="line" :hollow="line.id === '__none' || line.id === '__files'" :on-band="current" />
            <span class="pt-1.5 text-ui leading-[1.3] font-semibold">
              <FlowIcon :icon="line.icon" class="mr-[.4em] size-[1.1em] align-[-.15em]" :style="current ? undefined : { color: `var(--color-${line.color})` }" />{{ line.name }}
            </span>
            <span v-if="verdict" class="mt-1 grid size-6 place-items-center rounded-full text-inverted" :class="FLOW_VERDICT_COLORS[verdict]" :title="FLOW_VERDICT_LABELS[verdict]">
              <VerdictIcon :verdict="verdict" class="size-3.5" />
              <span class="sr-only">{{ FLOW_VERDICT_LABELS[verdict] }}</span>
            </span>
            <span v-else class="pt-2 font-mono text-meta leading-none font-semibold" :class="current ? 'opacity-85' : 'text-muted'" :title="`${decided} of ${line.stops.length} hunks have a verdict`">{{ decided }}/{{ line.stops.length }}</span>
          </UButton>
        </li>
      </ul>
    </div>

    <div class="p-3">
      <UButton
        v-if="(state.review.reviews || []).length"
        color="neutral"
        variant="ghost"
        :class="[itemClass(state.view.kind === 'reviews'), 'mb-2.5 grid grid-cols-[28px_1fr]']"
        :aria-current="state.view.kind === 'reviews'"
        @click="goReviews()"
      >
        <span class="grid size-7 place-items-center rounded-full" :class="state.view.kind === 'reviews' ? 'bg-(--ui-bg) text-default' : 'bg-accented text-default'" aria-hidden="true"><VerdictIcon verdict="comment" class="size-4" /></span>
        <span class="grid gap-1 pt-1.5">
          <span class="text-ui leading-none font-semibold">Existing reviews</span>
          <span v-if="reviewCounts" class="font-mono text-meta leading-none" :class="state.view.kind === 'reviews' ? 'opacity-85' : 'text-muted'">{{ reviewCounts }}</span>
        </span>
      </UButton>

      <button
        class="submit flex w-full cursor-pointer items-center gap-3 rounded-card bg-(--submit-c) px-3.5 py-3 text-left text-inverted transition-[transform,box-shadow] duration-150 ease-review"
        :class="{ posted: submit.posted }"
        :style="{ '--submit-c': SUBMIT_COLORS[submit.shown.icon] }"
        :aria-current="state.view.kind === 'terminus'"
        @click="goTerminus()"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-full bg-(--ui-bg) text-(--submit-c)" aria-hidden="true">
          <VerdictIcon :verdict="submit.shown.icon" class="size-4.5" />
        </span>
        <span v-if="submit.posted" class="grid min-w-0 gap-0.5">
          <b class="font-display text-lead leading-none">Review posted</b>
          <span class="text-label opacity-90">{{ submit.shown.done }}</span>
        </span>
        <span v-else class="grid min-w-0 gap-0.5">
          <b class="font-display text-lead leading-none">{{ hasOwnReview() ? 'Post new review' : 'Submit review' }}</b>
          <span class="text-label opacity-90">{{ plural(submit.accepted, 'remark') }} · {{ submit.proposal ? `${submit.proposal.label.toLowerCase()} proposed` : `${undecidedLabel()} to decide` }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.submit:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0, 0, 0, .18); }
.submit[aria-current="true"] { box-shadow: 0 0 0 3px var(--ui-bg-elevated), 0 0 0 6px var(--submit-c); }
.submit.posted { opacity: .92; }
</style>
