<script setup lang="ts">
const FLOW_VERDICT_COLORS: Record<string, string> = { approved: 'bg-success', changes: 'bg-error', comment: 'bg-(--ui-text-toned)' }
const SUBMIT_COLORS: Record<string, string> = { approved: 'var(--ui-success)', changes: 'var(--ui-error)', comment: 'var(--ui-text-toned)', undecided: 'var(--ui-text-toned)' }

const total = computed(() => state.review.hunks.length)
const seen = computed(() => total.value - unseenHunks().length)

const flows = computed(() => lines().map((line: { id: string, stops: { hunkId: string }[] }) => ({
  line,
  decided: line.stops.filter((stop) => verdictOf(stop.hunkId)).length,
  verdict: flowVerdict(line),
  current: state.view.kind === 'station' && state.view.line === line.id,
})))

const reviewCounts = computed(() => {
  const others = othersReviewCount()
  const toCheck = threadsToCheck().length
  return [others ? `${others} by others` : '', toCheck ? `${toCheck} to decide` : ''].filter(Boolean).join(' · ')
})

const submit = computed(() => {
  const proposal = VERDICTS.find((option) => option.id === proposedVerdict())
  const posted = postedReview()
  const shown = posted ? postedVerdict(posted) : proposal || { icon: 'undecided' }
  return { proposal, posted, shown, accepted: acceptedItems().length }
})

const itemClass = (current: boolean) => ['w-full items-start gap-2 rounded-md px-2.5 py-2.5 text-left text-default', current ? 'bg-default shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_var(--ui-border)] hover:bg-default' : 'hover:bg-accented/50']
</script>

<template>
  <aside class="flex min-h-0 flex-col border-r border-default bg-elevated dark:bg-elevated/55 max-md:order-3 max-md:border-t max-md:border-r-0" aria-label="Review navigation">
    <div class="border-b border-default px-2 pt-3.5 pb-1.5">
      <UButton color="neutral" variant="ghost" :class="itemClass(state.view.kind === 'home')" :aria-current="state.view.kind === 'home'" @click="goHome()">
        <span class="grid size-6 place-items-center" :class="state.view.kind === 'home' ? 'text-default' : 'text-toned'" aria-hidden="true">
          <UIcon name="i-lucide-house" class="size-4.5" />
        </span>
        <span class="pt-1 text-ui leading-[1.35] font-normal">Home</span>
      </UButton>
      <UProgress :model-value="seen" :max="total" size="xs" color="neutral" class="mx-2 mt-3 w-auto" aria-label="Hunks seen" />
      <p class="mx-2 mt-1.5 mb-0 text-meta text-muted">
        {{ seen }} of {{ plural(total, 'hunk') }} seen<template v-if="seen < total">
          · <UButton color="neutral" variant="ghost" size="xs" class="text-toned" @click="nextUnseen()">Next unseen</UButton>
        </template>
      </p>
    </div>

    <div class="relative min-h-0 flex-1 overflow-y-auto max-md:overflow-visible">
      <h2 class="mx-5 mt-4 mb-2 text-tag font-semibold tracking-[.06em] text-muted uppercase">Flows</h2>
      <ul role="list" class="m-0 list-none px-2 py-0">
        <li v-for="{ line, decided, verdict, current } in flows" :key="line.id">
          <UButton color="neutral" variant="ghost" :class="[itemClass(current), 'grid grid-cols-[26px_1fr_auto]']" :aria-current="current" @click="openFlow(line.id)">
            <FlowBullet :line="line" :hollow="line.id === '__none' || line.id === '__files'" />
            <span class="pt-1 text-ui leading-[1.35] font-normal">
              <FlowIcon :icon="line.icon" class="mr-[.4em] size-[1.05em] align-[-.15em]" :style="{ color: `var(--color-${line.color})` }" />{{ line.name }}
            </span>
            <span v-if="verdict" class="mt-px grid size-5.5 place-items-center rounded-full text-inverted" :class="FLOW_VERDICT_COLORS[verdict]" :title="FLOW_VERDICT_LABELS[verdict]">
              <VerdictIcon :verdict="verdict" class="size-3" />
              <span class="sr-only">{{ FLOW_VERDICT_LABELS[verdict] }}</span>
            </span>
            <span v-else class="pt-1.5 font-mono text-meta leading-none font-normal text-muted" :title="`${decided} of ${line.stops.length} hunks have a verdict`">{{ decided }}/{{ line.stops.length }}</span>
          </UButton>
        </li>
      </ul>
    </div>

    <div class="border-t border-default p-3">
      <UButton
        v-if="(state.review.reviews || []).length"
        color="neutral"
        variant="ghost"
        :class="[itemClass(state.view.kind === 'reviews'), 'mb-2 grid grid-cols-[26px_1fr]']"
        :aria-current="state.view.kind === 'reviews'"
        @click="goReviews()"
      >
        <span class="grid size-6 place-items-center text-toned" aria-hidden="true"><VerdictIcon verdict="comment" class="size-4.5" /></span>
        <span class="grid gap-1 pt-1">
          <span class="text-ui leading-[1.35] font-normal">Existing reviews</span>
          <span v-if="reviewCounts" class="font-mono text-meta leading-none font-normal text-muted">{{ reviewCounts }}</span>
        </span>
      </UButton>

      <button
        class="submit flex w-full cursor-pointer items-center gap-3 rounded-card text-left transition-[transform,box-shadow] duration-150 ease-review"
        :class="submit.posted ? 'posted border border-accented px-3 py-2 text-default' : 'border-0 px-3.5 py-3 text-inverted'"
        :style="{ '--submit-c': SUBMIT_COLORS[submit.shown.icon] }"
        :aria-current="state.view.kind === 'terminus'"
        @click="goTerminus()"
      >
        <span class="grid shrink-0 place-items-center rounded-full bg-(--submit-c) text-inverted" :class="submit.posted ? 'size-7' : 'size-8.5'" aria-hidden="true">
          <VerdictIcon :verdict="submit.shown.icon" class="size-4" />
        </span>
        <span v-if="submit.posted" class="grid min-w-0 gap-0.5">
          <b class="text-ui">Review posted</b>
          <span class="text-label opacity-80">{{ submit.shown.done }}</span>
        </span>
        <span v-else class="grid min-w-0 gap-0.5">
          <b class="text-body">{{ hasOwnReview() ? 'Post new review' : 'Submit review' }}</b>
          <span class="text-label opacity-80">{{ plural(submit.accepted, 'remark') }} · {{ submit.proposal ? `${submit.proposal.label.toLowerCase()} proposed` : `${undecidedLabel()} to decide` }}</span>
        </span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.submit:not(.posted) {
  background: linear-gradient(120deg, color-mix(in srgb, var(--submit-c) 70%, var(--ui-text)) 0%, var(--ui-text) 75%);
  color: var(--ui-bg);
  box-shadow: 0 6px 18px rgba(0, 0, 0, .16);
}
.submit:not(.posted):hover { transform: translateY(-1px); box-shadow: 0 10px 24px rgba(0, 0, 0, .2); }
.submit:not(.posted)[aria-current="true"] { box-shadow: 0 0 0 2px var(--ui-bg), 0 0 0 4px var(--ui-text); }
.submit.posted:hover { border-color: var(--ui-text-muted); }
</style>
