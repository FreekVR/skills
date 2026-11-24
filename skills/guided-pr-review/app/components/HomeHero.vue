<script setup lang="ts">
// The PR on the band of Home: who wrote it, its title and one tile per line to start from.
const review = computed(() => state.review)
const position = computed(() => (hasStack() ? stackPosition() : null))

const flows = computed(() => {
  const items = lines().map((line: { id: string, stops: { hunkId: string }[] }) => ({
    line,
    seen: line.stops.filter((stop) => isSeen(stop.hunkId)).length,
    verdict: flowVerdict(line),
    group: false,
  }))
  // The group has its own row, under the flows.
  return hasGenerated() ? [...items, { line: { ...GENERATED_LINE, stops: generatedFiles().map(({ hunkId }: { hunkId: string }) => ({ hunkId })) }, seen: 0, verdict: groupCountsAs(), group: true }] : items
})

function tileLabel(flow: { line: { stops: { hunkId: string }[] }, seen: number, verdict: string | null, group: boolean }) {
  const findings = flowFindingsPill(flow.line)
  if (flow.group) return flow.verdict ? countsAsLabel() : [plural(flow.line.stops.length, 'file'), findings?.text, 'one verdict'].filter(Boolean).join(' · ')
  if (flow.verdict) return FLOW_VERDICT_LABELS[flow.verdict]
  // The tile carries what the flows list on Home used to show: the seen count, the open findings and new or changed hunks.
  const fresh = flow.line.stops.some((stop: { hunkId: string }) => state.freshHunks.has(stop.hunkId))
  return [plural(flow.line.stops.length, 'hunk'), flow.seen && `${flow.seen} seen`, findings?.text, fresh && 'changed'].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="px-gutter pt-5 pb-7">
    <p class="m-0 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-label text-toned">
      <a :href="review.pr.url" target="_blank" rel="noopener" class="font-semibold text-default underline-offset-3">{{ review.pr.owner }}/{{ review.pr.repo }}#{{ review.pr.number }}</a>
      <span class="inline-flex items-center gap-1.5">· <UAvatar :src="avatar(review.pr.author)" alt="" size="2xs" class="has-[[data-slot=fallback]]:hidden" /> by {{ review.pr.author }}</span>
      <span v-if="position">· stack {{ position.index }} of {{ position.size }}</span>
    </p>
    <h2 class="mt-2 mb-5 max-w-[24ch] font-display text-display leading-[1.05]">
      <MarkupText :text="review.pr.title" />
    </h2>
    <ul role="list" class="m-0 flex list-none flex-wrap gap-2.5 p-0" aria-label="Lines">
      <li v-for="flow in flows" :key="flow.line.id" :class="{ 'basis-full': flow.group }">
        <button
          class="flex cursor-pointer items-center gap-3 rounded-lg py-2.5 pr-4.5 pl-3 text-left transition-[transform,filter] duration-150 ease-review hover:-translate-y-px hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          :class="flow.group ? 'bg-white text-(--color-generated)' : flow.line.id === '__none' || flow.line.id === '__files' ? 'bg-white/15 text-white' : 'bg-(--line) text-white'"
          :style="{ '--line': `var(--color-${flow.line.color})` }"
          @click="openFlow(flow.line.id)"
        >
          <FlowBullet :line="flow.line" :hollow="flow.line.id === '__none' || flow.line.id === '__files'" :on-band="!flow.group" class="size-8! text-ui!" />
          <span class="grid gap-0.5">
            <b class="text-ui leading-[1.3]"><FlowIcon :icon="flow.line.icon" class="mr-[.4em] size-[1.05em] align-[-.15em]" />{{ flow.line.name }}</b>
            <span class="text-meta leading-none opacity-90">{{ tileLabel(flow) }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>
