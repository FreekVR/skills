<script setup lang="ts">
// Width of one stop on the flow map, in pixels. The ring and the filled bar move by this much per hunk.
const STOP_WIDTH = 132
const THEME_ICONS: Record<string, string> = { system: 'i-lucide-monitor', light: 'i-lucide-sun', dark: 'i-lucide-moon' }
const VERDICT_TICKS: Record<string, string> = { approved: 'bg-success border-success', changes: 'bg-error border-error', comment: 'bg-(--ui-text-toned) border-(--ui-text-toned)' }
const AC_COLORS: Record<string, 'success' | 'error' | 'warning'> = { 'met': 'success', 'not-met': 'error', 'unclear': 'warning' }

const header = useTemplateRef<HTMLElement>('header')
const map = useTemplateRef<HTMLElement>('map')

const line = computed(() => (state.view.kind === 'station' ? lineById(state.view.line) : null))
const index = computed(() => Math.max(0, state.view.index || 0))
const seenCount = computed(() => line.value?.stops.filter((stop: { hunkId: string }) => isSeen(stop.hunkId)).length ?? 0)
const criteria = computed(() => (line.value ? flowCriteria(line.value) : []))
const criteriaOpen = computed(() => state.ui.criteriaOpen ?? state.view.index === 0)

const stops = computed(() => {
  const current = line.value
  if (!current) return []
  return current.stops.map((stop: { hunkId: string }, at: number) => {
    const hunk = hunkById(stop.hunkId)
    const seen = isSeen(stop.hunkId)
    return {
      at,
      code: stationCode(current, at),
      name: hunk ? fileName(hunk.file) : '?',
      file: hunk ? hunk.file : '',
      label: `${stationCode(current, at)} ${hunk ? hunk.file : 'missing hunk'}${seen ? ', seen' : ', not seen'}`,
      seen,
      verdict: verdictOf(stop.hunkId),
      fresh: state.freshHunks.has(stop.hunkId),
      stamp: state.ui.stamp === stop.hunkId,
      others: linesOf(stop.hunkId).filter((other: { id: string }) => other.id !== current.id),
    }
  })
})

const reviews = computed(() => state.reviews || [])
const switcherOpen = computed({ get: () => Boolean(state.ui.switcherOpen), set: toggleSwitcher })
const draftCount = computed(() => localCount())
const draftLabel = computed(() => (draftCount.value ? `Post as draft. ${plural(draftCount.value, 'remark')} not on GitHub yet.` : 'Post as draft'))
const theme = computed(() => state.reviewer.theme || 'system')

function tickClass(stop: { verdict?: string, seen: boolean, stamp: boolean }) {
  if (stop.verdict) return ['-mt-px grid size-5 place-items-center text-inverted', VERDICT_TICKS[stop.verdict], stop.stamp && 'stamp']
  return ['mt-0.5 size-3.5', stop.seen ? 'border-primary bg-primary' : 'border-(--line) bg-default']
}

function onCriteriaToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (open !== criteriaOpen.value) state.ui.criteriaOpen = open
}

// The map keeps the hunk in view in its middle.
function centerMap() {
  if (!map.value) return
  map.value.scrollLeft = Math.max(0, index.value * STOP_WIDTH + STOP_WIDTH / 2 - map.value.clientWidth / 2)
}
watch(() => (line.value ? `${line.value.id}:${index.value}` : null), centerMap, { flush: 'post' })
onMounted(centerMap)

// The map scrolls sideways with a vertical wheel and with a mouse drag. At either end the wheel scrolls the page again.
function onWheel(event: WheelEvent) {
  const element = map.value
  if (!element || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
  const max = element.scrollWidth - element.clientWidth
  const next = Math.max(0, Math.min(max, element.scrollLeft + event.deltaY))
  if (max <= 0 || next === element.scrollLeft) return
  event.preventDefault()
  element.scrollLeft = next
}

// Once a drag moves, the map captures the pointer, so the button under it never gets the click.
const drag = ref<{ x: number, left: number, moved: boolean } | null>(null)
function onPointerDown(event: PointerEvent) {
  const element = map.value
  if (!element || event.pointerType !== 'mouse' || event.button !== 0 || element.scrollWidth <= element.clientWidth) return
  drag.value = { x: event.clientX, left: element.scrollLeft, moved: false }
}
function onPointerMove(event: PointerEvent) {
  if (!drag.value || !map.value) return
  if (!(event.buttons & 1)) return endDrag()
  const distance = event.clientX - drag.value.x
  if (!drag.value.moved && Math.abs(distance) < 4) return
  if (!drag.value.moved) map.value.setPointerCapture(event.pointerId)
  drag.value.moved = true
  map.value.scrollLeft = drag.value.left - distance
}
function endDrag() { drag.value = null }
useEventListener('pointermove', onPointerMove)
useEventListener('pointerup', endDrag)
useEventListener('pointercancel', endDrag)

// Scrolling down a hunk shrinks the map to its dots, so the diff gets the room; scrolling back up shows it in full.
useEventListener(document, 'scroll', (event: Event) => {
  const scroller = event.target as HTMLElement
  if (scroller.id !== 'main' || !line.value) return
  const current = Boolean(state.ui.compactMap)
  const compact = scroller.scrollTop > 120 ? true : scroller.scrollTop < 40 ? false : current
  if (compact === current) return
  // A smaller header leaves less to scroll; it only shrinks when the current scroll position still fits afterwards.
  if (compact && header.value) {
    const top = scroller.scrollTop
    header.value.classList.add('compact')
    const room = scroller.scrollHeight - scroller.clientHeight
    header.value.classList.remove('compact')
    scroller.scrollTop = top
    if (room < top) return
  }
  state.ui.compactMap = compact
}, { capture: true, passive: true })
</script>

<template>
  <header
    ref="header"
    class="relative z-5 border-b border-default bg-default"
    :class="{ compact: line && state.ui.compactMap }"
    :style="line ? { '--line': `var(--color-${line.color})` } : undefined"
  >
    <div class="strip-top flex items-center gap-5 px-gutter pt-4.5 max-md:flex-wrap" :class="{ 'pb-3': !line }">
      <div class="flex min-w-0 flex-1 items-start gap-3 max-md:basis-full">
        <FlowBullet v-if="line" :line="line" />
        <div class="min-w-0">
          <h1 tabindex="-1" class="m-0 text-title outline-none leading-tight font-bold tracking-[-0.015em]">
            <UIcon v-if="line && /^[a-z0-9-]+$/.test(line.icon || '')" :name="`i-lucide-${line.icon}`" class="mr-[.4em] size-[1.05em] align-[-.15em] text-(--line)" aria-hidden="true" />{{ line ? line.name : viewTitle() }}
          </h1>
          <p v-if="line" class="compact-hide m-0 mt-1 truncate text-label text-muted max-md:hidden">
            {{ seenCount }} of {{ plural(line.stops.length, 'hunk') }} seen
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2 max-md:min-w-0 max-md:shrink max-md:flex-wrap">
        <UPopover v-if="reviews.length > 1" v-model:open="switcherOpen" :content="{ align: 'end', sideOffset: 6 }">
          <UButton color="neutral" variant="outline" class="font-semibold" :label="plural(reviews.length, 'review')" :aria-label="`${plural(reviews.length, 'review')}: switch to another review`" trailing-icon="i-lucide-chevron-down" />
          <template #content>
            <ul role="list" class="m-0 grid w-[min(420px,calc(100vw-32px))] list-none gap-0.5 p-1.5">
              <li
                v-for="review in reviews"
                :key="reviewRef(review)"
                class="rounded-md text-label"
                :class="isCurrentReview(review) ? 'bg-elevated px-2.5 py-2' : 'has-[>a:hover]:bg-elevated'"
                :aria-current="isCurrentReview(review) ? 'page' : undefined"
              >
                <template v-if="isCurrentReview(review)">
                  <span class="block font-semibold">{{ reviewRef(review) }}{{ review.state === 'open' ? '' : ` · ${review.state}` }}</span>
                  <span class="block text-muted">{{ review.title }}</span>
                </template>
                <template v-else>
                  <a :href="`/${review.owner}/${review.repo}/${review.number}`" class="grid gap-0.5 px-2.5 py-2 text-default no-underline">
                    <span class="font-semibold">{{ reviewRef(review) }}{{ review.state === 'open' ? '' : ` · ${review.state}` }}</span>
                    <span class="text-muted">{{ review.title }}</span>
                  </a>
                  <ResumeHelp v-if="!review.agentConnected" :help="resumeHelp(review)" lead="Not running. " class="px-2.5 pb-2 text-muted" />
                </template>
              </li>
            </ul>
          </template>
        </UPopover>

        <UButton
          v-if="!postedReview()"
          color="warning"
          variant="outline"
          class="font-semibold"
          :aria-label="draftLabel"
          :title="draftLabel"
          @click="post('draft')"
        >
          Post as draft
          <UBadge v-if="draftCount" color="warning" variant="solid" size="sm" class="ml-1 rounded-full" aria-hidden="true">
            {{ draftCount }}
          </UBadge>
        </UButton>

        <div class="inline-flex rounded-lg border border-accented p-0.5" role="group" aria-label="Colour theme">
          <UTooltip v-for="option in THEMES" :key="option.id" :text="option.label">
            <UButton
              :icon="THEME_ICONS[option.id]"
              color="neutral"
              :variant="theme === option.id ? 'soft' : 'ghost'"
              size="sm"
              square
              :class="theme === option.id ? 'text-default' : 'text-muted'"
              :aria-label="option.label"
              :aria-pressed="theme === option.id"
              @click="setTheme(option.id)"
            />
          </UTooltip>
        </div>

        <UTooltip text="Keyboard shortcuts" :kbds="['?']">
          <UButton icon="i-lucide-keyboard" color="neutral" variant="ghost" size="sm" square class="text-muted max-md:hidden" aria-label="Keyboard shortcuts" @click="showShortcuts()" />
        </UTooltip>
      </div>
    </div>

    <template v-if="line">
      <details v-if="criteria.length" class="criteria compact-hide mx-gutter mt-3 mb-0.5 max-w-[110ch] rounded-card border px-3.5 py-2" :open="criteriaOpen" @toggle="onCriteriaToggle">
        <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5">
          <span class="text-meta font-extrabold tracking-[.08em] text-(--line) uppercase">This flow should</span>
          <AiTag v-if="criteriaHaveVerdicts(line)" label="checked by AI" />
          <span class="criteria-keys flex flex-wrap gap-x-3.5 gap-y-1.5">
            <span v-for="{ id, criterion } in criteria" :key="id" class="inline-flex items-center gap-1.5 font-mono text-label font-semibold text-toned">
              {{ id }}
              <UBadge v-if="criterion.verdict" :color="AC_COLORS[criterion.verdict]" variant="solid" size="sm" class="font-sans font-bold">{{ AC_VERDICTS[criterion.verdict] }}</UBadge>
            </span>
          </span>
        </summary>
        <ul role="list" class="mt-2.5 mb-1.5 grid list-none gap-2.5 p-0">
          <li v-for="{ id, criterion } in criteria" :key="id" class="text-lead font-semibold">
            <span class="mr-2.5 font-mono text-label"><MarkupText :text="id" /></span><MarkupText :text="criterion.text" />
            <span
              v-if="criterionSource(criterion)"
              class="ml-2 inline-block rounded-full border border-accented px-2 py-1 align-[2px] text-tag leading-none font-semibold whitespace-nowrap text-toned"
              :class="{ italic: criterionSource(criterion).kind === 'description' }"
              :title="criterionSource(criterion).title || undefined"
            >{{ criterionSource(criterion).label }}</span>
            <UBadge v-if="criterion.verdict" :color="AC_COLORS[criterion.verdict]" variant="solid" size="sm" class="ml-2.5 align-[2px] font-sans font-bold" :title="criterion.note || undefined">
              {{ AC_VERDICTS[criterion.verdict] }}
            </UBadge>
          </li>
        </ul>
      </details>
      <div v-else-if="line.noCriteria" class="criteria compact-hide mx-gutter mt-3 mb-0.5 flex max-w-[110ch] flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border px-3.5 py-2">
        <span class="text-meta font-extrabold tracking-[.08em] text-(--line) uppercase">This flow should</span>
        <p class="m-0 text-ui text-toned">No acceptance criteria to check. <MarkupText :text="line.noCriteria" /></p>
      </div>

      <nav
        ref="map"
        class="map relative flex cursor-grab overflow-x-auto px-gutter pt-2.5 pb-2"
        :class="{ 'cursor-grabbing select-none': drag?.moved }"
        :aria-label="`Hunks in ${line.name}`"
        @wheel="onWheel"
        @pointerdown="onPointerDown"
      >
        <span class="map-hint start" aria-hidden="true" />
        <div :key="line.id" class="relative flex w-max max-md:mr-gutter">
          <div class="absolute top-[34px] right-[66px] left-[66px] h-1.5 rounded-[3px] bg-[color-mix(in_srgb,var(--line)_45%,var(--ui-bg))]" />
          <div class="absolute top-[34px] left-[66px] h-1.5 rounded-[3px] bg-(--line) transition-[width] duration-[380ms] ease-review motion-reduce:transition-none" :style="{ width: `${index * STOP_WIDTH}px` }" />
          <button
            v-for="stop in stops"
            :key="stop.at"
            class="stop group relative w-[132px] flex-[0_0_132px] cursor-[inherit] pb-1.5 text-center text-toned"
            :aria-label="stop.label"
            :aria-current="stop.at === index ? 'step' : undefined"
            @click="drag?.moved || go(line.id, stop.at)"
          >
            <span class="block h-7 pt-1 font-mono text-tag leading-none font-semibold tracking-[.02em] text-muted">{{ stop.code }}</span>
            <span class="relative mx-auto block rounded-full border-3" :class="tickClass(stop)">
              <VerdictIcon v-if="stop.verdict" :verdict="stop.verdict" :class="stop.verdict === 'approved' ? 'size-2.5' : 'size-3.5'" />
            </span>
            <span
              class="compact-hide mt-1.5 block truncate px-1 text-meta leading-tight group-hover:text-default group-hover:underline group-hover:underline-offset-3"
              :class="stop.at === index ? 'font-semibold text-default' : 'text-muted'"
              :data-path="stop.file"
            >{{ stop.name }}</span>
            <span class="compact-hide mt-0.5 block h-[22px] truncate px-1 text-tag leading-[22px] text-toned">
              <span v-if="stop.fresh" class="font-semibold text-default">changed</span>
              <template v-if="stop.fresh && stop.others.length"> · </template>
              <template v-if="stop.others.length">also in <FlowBullet v-for="other in stop.others" :key="other.id" :line="other" mini /></template>
            </span>
          </button>
          <span
            class="pointer-events-none absolute top-[22px] size-[30px] rounded-full border-3 border-(--ui-text) shadow-[0_0_0_3px_var(--ui-bg)] transition-transform duration-[380ms] ease-review motion-reduce:transition-none"
            :style="{ left: `${STOP_WIDTH / 2 - 15}px`, transform: `translateX(${index * STOP_WIDTH}px)` }"
            aria-hidden="true"
          />
        </div>
        <span class="map-hint end" aria-hidden="true" />
      </nav>

      <details class="legend-wrap compact-hide px-gutter pb-2.5" :open="state.ui.legendOpen" @toggle="state.ui.legendOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="inline-flex cursor-pointer list-none items-center gap-1.5 text-meta text-muted hover:text-toned">
          Legend
        </summary>
        <p class="m-0 flex flex-wrap items-center gap-4 pt-2 text-meta text-muted">
          <span><span class="legend-dot mr-1.5 inline-block size-3.5 rounded-full border-2 border-(--ui-text) align-[-3px]" />current hunk</span>
          <span><span class="legend-dot mr-1.5 inline-block size-2.5 rounded-full border-2 border-(--line) align-[-1px]" />not read</span>
          <span><span class="legend-dot mr-1.5 inline-block size-2.5 rounded-full border-2 border-primary bg-primary align-[-1px]" />read</span>
          <span v-for="(label, verdict) in { approved: 'you approved', changes: 'you request changes', comment: 'you comment' }" :key="verdict">
            <span class="legend-dot mr-1.5 inline-grid size-4 place-items-center rounded-full border-2 align-[-4px] text-inverted" :class="VERDICT_TICKS[verdict]">
              <VerdictIcon :verdict="verdict" :class="verdict === 'approved' ? 'size-2' : 'size-3'" />
            </span>{{ label }}
          </span>
          <span>also in <FlowBullet :line="{ name: 'Flow B', letter: 'B', color: 'line-b' }" mini />: the hunk is part of flow B too</span>
        </p>
      </details>
    </template>
  </header>
</template>

<style scoped>
.criteria {
  border-color: color-mix(in srgb, var(--line) 55%, transparent);
  background: color-mix(in srgb, var(--line) 7%, var(--ui-bg));
}
:root[data-theme="dark"] .criteria { background: color-mix(in srgb, var(--line) 12%, var(--ui-bg)); }
.criteria[open] .criteria-keys { display: none; }
summary::-webkit-details-marker { display: none; }
summary::before {
  content: "";
  width: 6px;
  height: 6px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  transition: transform .15s var(--ease-review);
}
details[open] > summary::before { transform: rotate(45deg); }
.criteria summary::before { color: var(--line); }
.legend-wrap summary::before { width: 5px; height: 5px; }

.map-hint { position: sticky; flex: 0 0 0; align-self: stretch; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .2s var(--ease-review); }
.map-hint.start { left: 0; }
.map-hint.end { right: 0; }
.map-hint::before { content: ""; position: absolute; top: 0; bottom: 0; width: calc(2 * var(--spacing-gutter)); }
.map-hint.start::before { left: calc(-1 * var(--spacing-gutter)); background: linear-gradient(to right, var(--ui-bg), transparent); }
.map-hint.end::before { right: calc(-1 * var(--spacing-gutter)); background: linear-gradient(to left, var(--ui-bg), transparent); }
@supports (container-type: scroll-state) {
  .map { container-type: scroll-state; }
  @container scroll-state(scrollable: left) { .map-hint.start { opacity: 1; } }
  @container scroll-state(scrollable: right) { .map-hint.end { opacity: 1; } }
}

.stamp { animation: stamp .42s var(--ease-review); }
@keyframes stamp { from { opacity: 0; transform: scale(.35); } }
@media (prefers-reduced-motion: reduce) { .stamp { animation: none; } }

/* On a phone the map scrolls by touch, so it needs no scroll bar. */
@media (width < 48rem) {
  .map { scrollbar-width: none; }
  .map::-webkit-scrollbar { display: none; }
}
@media (width >= 48rem) {
  .compact .strip-top { padding-top: 10px; }
  .compact .compact-hide { display: none; }
  /* The compact map scrolls with the wheel and by dragging, so it needs no scroll bar under its dots. */
  .compact .map { padding-top: 6px; padding-bottom: 10px; scrollbar-width: none; }
  .compact .map::-webkit-scrollbar { display: none; }
  .compact .stop { padding-bottom: 0; }
}
</style>
