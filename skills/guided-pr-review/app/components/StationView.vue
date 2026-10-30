<script setup lang="ts">
// One hunk of a flow: its head, the AI context, the diff with its notes, the advice, the questions and the verdict.
interface Line { id: string, letter: string, name: string, color: string, shape?: string, icon?: string, explanation?: string, entry?: string, end?: string, stops: { hunkId: string, why: string }[] }

const line = computed(() => lineById(state.view.line) as Line)
const stop = computed(() => line.value.stops[state.view.index])
const hunk = computed(() => (stop.value ? hunkById(stop.value.hunkId) : null))
const code = computed(() => stationCode(line.value, state.view.index))
const isFirst = computed(() => line.value === lines()[0] && state.view.index === 0)
const showIntro = computed(() => state.view.index === 0 && Boolean(line.value.explanation || line.value.entry))

// The folder of the file, so two files with the same name are easy to tell apart.
const folder = computed(() => {
  const file: string = hunk.value?.file || ''
  return file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
})

// The other flows that pass this hunk, each with the stop where they do.
const others = computed(() => (hunk.value ? (linesOf(hunk.value.id) as Line[]).filter((other) => other.id !== line.value.id) : []).map((other) => {
  const index = other.stops.findIndex((otherStop) => otherStop.hunkId === hunk.value.id)
  return { line: other, index, code: stationCode(other, index) }
}))

const ICON_NAME = /^[a-z0-9-]+$/
</script>

<template>
  <div v-if="!hunk" class="max-w-[1080px] px-11 pt-9 pb-[120px] max-md:px-4">
    <p class="text-toned">This step points to a hunk that is not in the review data. Ask the agent to run the flow check again.</p>
  </div>
  <article
    v-else
    :key="`${line.id}:${state.view.index}`"
    class="station max-w-[1080px] min-w-0 px-11 pt-9 pb-[120px] [overflow-wrap:anywhere] max-md:px-4"
    :class="state.ui.enter && `enter-${state.ui.enter}`"
    :style="{ '--line': `var(--color-${line.color})` }"
  >
    <section v-if="showIntro" class="mb-8 rounded-xl border border-[color-mix(in_srgb,var(--line)_45%,transparent)] bg-[color-mix(in_srgb,var(--line)_7%,var(--ui-bg))] px-[22px] pt-[18px] pb-5 dark:bg-[color-mix(in_srgb,var(--line)_12%,var(--ui-bg))]" aria-label="About this flow">
      <div class="flex flex-wrap items-center gap-2.5">
        <FlowBullet :line="line" />
        <h2 class="m-0 text-[19px] leading-[1.3] tracking-[-0.01em]">
          <UIcon v-if="ICON_NAME.test(line.icon || '')" :name="`i-lucide-${line.icon}`" class="mr-[.4em] size-[1.05em] align-[-.15em] text-(--line)" aria-hidden="true" />{{ line.name }}
        </h2>
        <AiTag label="AI summary" />
      </div>
      <p v-if="line.explanation" class="mt-2.5 mb-0 max-w-[70ch] text-[15.5px] leading-[1.6] text-toned"><MarkupText :text="line.explanation" /></p>
      <ul v-if="line.entry" role="list" class="mt-3.5 mb-0 grid list-none grid-cols-[16px_max-content_minmax(0,1fr)] items-start gap-x-2.5 gap-y-2 p-0" aria-label="Where this flow starts and ends">
        <li v-for="end in [{ icon: 'i-lucide-arrow-right-to-line', label: 'Starts at', name: line.entry }, { icon: 'i-lucide-flag', label: 'Ends at', name: line.end }]" :key="end.label" class="contents">
          <UIcon :name="end.icon" class="mt-0.5 size-4 text-(--line)" aria-hidden="true" />
          <span class="text-[13px] leading-5 text-muted">{{ end.label }}</span>
          <span class="font-mono text-[13px] leading-5 text-default"><template v-for="(part, index) in codeName(end.name)" :key="index">{{ part }}<wbr></template></span>
        </li>
      </ul>
    </section>

    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span class="rounded border-2 border-(--line) bg-default px-1.5 py-[3px] font-mono text-[13px] leading-none font-bold text-default">{{ code }}</span>
      <h2 class="m-0 font-mono text-[17px] leading-[1.3] font-semibold break-all">{{ fileName(hunk.file) }}</h2>
      <span class="inline-flex min-w-0 items-baseline gap-1 font-mono text-[12.5px] text-muted" :title="folder ? `Folder: ${folder}` : 'The file is in the root of the repository'">
        <UIcon name="i-lucide-folder" class="size-3.5 shrink-0 self-center" aria-hidden="true" />
        <span class="sr-only">in folder</span>
        <span class="break-all">{{ folder || 'repository root' }}</span>
      </span>
      <span class="text-[12.5px] text-muted">{{ hunk.status }}{{ hunk.oldFile && hunk.oldFile !== hunk.file ? ` from ${hunk.oldFile}` : '' }}<template v-if="hunk.context"> · in <code class="font-mono text-[13px]">{{ hunk.context }}</code></template></span>
    </div>

    <p v-if="state.freshHunks.has(hunk.id)" class="mt-2.5 mb-0 inline-block rounded-md border border-warning px-2.5 py-1.5 text-[13px] text-default">This hunk is new or changed since your last session.</p>

    <div v-if="others.length" class="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-toned">
      Also in
      <UButton
        v-for="other in others"
        :key="other.line.id"
        color="neutral"
        variant="outline"
        size="sm"
        class="gap-1.5 font-normal whitespace-normal text-default ring-accented hover:ring-(--ui-text-muted)"
        :title="`Open this hunk in the flow ${other.line.name}`"
        @click="go(other.line.id, other.index)"
      >
        <FlowBullet :line="other.line" class="size-5! text-[11px]!" />
        <UIcon v-if="ICON_NAME.test(other.line.icon || '')" :name="`i-lucide-${other.line.icon}`" class="size-[1.05em] text-(--line)" :style="{ '--line': `var(--color-${other.line.color})` }" aria-hidden="true" />{{ other.line.name }}
        <span class="font-mono text-[11.5px] leading-none font-semibold whitespace-nowrap text-muted">{{ other.code }}</span>
      </UButton>
      <span v-if="seenBefore(hunk.id)">You saw this hunk in another flow already.</span>
    </div>

    <StationContext :hunk="hunk" :why="stop.why" />
    <DiffView :hunk="hunk" />
    <StationAdvice :hunk="hunk" />
    <StationAsk :hunk="hunk" />

    <div class="mt-[34px] flex justify-between gap-3 border-t border-default pt-4">
      <UButton color="primary" variant="outline" :disabled="isFirst" @click="step(-1)">Previous hunk</UButton>
      <StationVerdicts :hunk-id="hunk.id" />
    </div>

    <StationWholeFile />
  </article>
</template>

<style scoped>
@keyframes enter-next { from { opacity: 0; transform: translateX(28px); } }
@keyframes enter-prev { from { opacity: 0; transform: translateX(-28px); } }
.station.enter-next { animation: enter-next .34s cubic-bezier(.33, 1, .68, 1); }
.station.enter-prev { animation: enter-prev .34s cubic-bezier(.33, 1, .68, 1); }
@media (prefers-reduced-motion: reduce) {
  .station.enter-next, .station.enter-prev { animation: none; }
}
</style>
