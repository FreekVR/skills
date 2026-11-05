<script setup lang="ts">
// Width of one stop on the flow map, in pixels. The filled bar moves by this much per hunk.
const STOP_WIDTH = 132
const THEME_ICONS: Record<string, string> = { system: 'i-lucide-monitor', light: 'i-lucide-sun', dark: 'i-lucide-moon' }

const header = useTemplateRef<HTMLElement>('header')
const reducedMotion = usePreferredReducedMotion()
const map = useTemplateRef<HTMLElement>('map')

const line = computed(() => (state.view.kind === 'station' ? lineById(state.view.line) : null))
const index = computed(() => Math.max(0, state.view.index || 0))
const seenCount = computed(() => line.value?.stops.filter((stop: { hunkId: string }) => isSeen(stop.hunkId)).length ?? 0)
const criteria = computed(() => (line.value ? flowCriteria(line.value) : []))
// The hunk of the current stop, named in the band above the map.
const hunk = computed(() => (line.value ? hunkById(line.value.stops[index.value]?.hunkId) : null))
const code = computed(() => (line.value ? stationCode(line.value, index.value) : ''))
const folder = computed(() => {
  const file: string = hunk.value?.file || ''
  return file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
})
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

const reviewCount = computed(() => state.reviews?.length || 0)
const groups = computed(sessionGroups)
const switcherOpen = computed({ get: () => Boolean(state.ui.switcherOpen), set: toggleSwitcher })
const draftCount = computed(() => localCount())
const waitingCount = computed(() => waitingRequests().length)
const AGENT_TEXT_COLORS: Record<string, string> = { working: 'text-muted', paused: 'text-warning', none: 'text-warning' }
const draftLabel = computed(() => (draftCount.value ? `Post as draft. ${plural(draftCount.value, 'remark')} not on GitHub yet.` : 'Post as draft'))
const theme = computed(() => state.reviewer.theme || 'system')

// A verdict is a white disc with the icon in its colour, so it reads on a band of any colour and in both themes.
const TICK_ICON_COLORS: Record<string, string> = { approved: 'text-success', changes: 'text-error', comment: 'text-neutral-700' }

// On the band every tick is white. The current one is bigger.
function tickClass(stop: { verdict?: string, seen: boolean, stamp: boolean }) {
  if (stop.verdict) return ['-mt-px grid size-5 place-items-center border-white bg-white', TICK_ICON_COLORS[stop.verdict], stop.stamp && 'stamp']
  return ['mt-0.5 size-3.5 border-white', stop.seen ? 'bg-white' : 'bg-(--line)']
}

function onCriteriaToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (open !== criteriaOpen.value) state.ui.criteriaOpen = open
}

// The map keeps the hunk in view in its middle. A move within the flow scrolls there smoothly; another flow starts there.
function centerMap(smooth = false) {
  if (!map.value) return
  const left = Math.max(0, index.value * STOP_WIDTH + STOP_WIDTH / 2 - map.value.clientWidth / 2)
  map.value.scrollTo({ left, behavior: smooth && reducedMotion.value !== 'reduce' ? 'smooth' : 'instant' })
}
watch(() => (line.value ? [line.value.id, index.value] : null), (now, before) => centerMap(Boolean(now && before && now[0] === before[0])), { flush: 'post' })
onMounted(() => centerMap())

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

// Only the hunk below the header scrolls, so a wheel over the header that nothing in it used scrolls the hunk.
// Where the page itself scrolls, as on a phone, the hunk is not a scroller and the wheel stays with the page.
// A pinch, or Ctrl and the wheel, zooms. A wheel that counts in lines, as in Firefox, scrolls about 16 pixels per line.
function onHeaderWheel(event: WheelEvent) {
  const main = document.getElementById('main')
  if (event.defaultPrevented || event.ctrlKey || !main || main.scrollHeight <= main.clientHeight) return
  event.preventDefault()
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? main.clientHeight : 1
  main.scrollBy({ top: event.deltaY * unit })
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

// Resting the pointer on the compact header shows it in full; a short delay keeps a passing pointer from opening it.
const hovered = useElementHover(header, { delayEnter: 250 })
const peek = computed(() => hovered.value && Boolean(state.ui.compactMap))

// The header animates between its two layouts: the parts that only the full header shows fade out first, then the
// height changes and the map slides to its new place; growing, those parts fade in at the end. A move to another hunk
// switches at once, because the whole header changes then.
const collapsed = computed(() => Boolean(line.value && state.ui.compactMap) && !peek.value)
const shownCollapsed = ref(collapsed.value)
const viewKey = computed(() => `${state.view.kind}:${state.view.line}:${state.view.index}`)
const HEADER_EASE = 'cubic-bezier(.22, 1, .36, 1)'
let running: Animation[] = []
watch([collapsed, viewKey], ([collapse, view], [, oldView]) => {
  running.forEach((animation) => animation.cancel())
  running = []
  const strip = header.value
  if (!strip || reducedMotion.value === 'reduce' || view !== oldView) {
    shownCollapsed.value = collapse
    return
  }
  if (!collapse) return switchLayout(strip, false)
  const fades = [...strip.querySelectorAll('.compact-hide')].map((part) => part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' }))
  running = [...fades]
  Promise.all(fades.map((fade) => fade.finished)).then(() => {
    if (collapsed.value !== collapse) return
    switchLayout(strip, true).then(() => fades.forEach((fade) => fade.cancel()))
  }, () => {})
})

async function switchLayout(strip: HTMLElement, collapse: boolean) {
  const from = strip.getBoundingClientRect().height
  const mapFrom = map.value?.getBoundingClientRect().top ?? 0
  shownCollapsed.value = collapse
  await nextTick()
  const to = strip.getBoundingClientRect().height
  if (from === to) return
  const timing = { duration: to > from ? 340 : 280, easing: HEADER_EASE }
  strip.style.overflow = 'hidden'
  const resize = strip.animate([{ height: `${from}px` }, { height: `${to}px` }], timing)
  resize.onfinish = resize.oncancel = () => { strip.style.overflow = '' }
  running.push(resize)
  if (map.value) running.push(map.value.animate([{ transform: `translateY(${mapFrom - map.value.getBoundingClientRect().top}px)` }, { transform: 'none' }], timing))
  if (!collapse) for (const part of strip.querySelectorAll('.compact-hide')) running.push(part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, delay: 140, easing: 'ease-out', fill: 'backwards' }))
}
</script>

<template>
  <header
    ref="header"
    class="band relative z-5"
    :class="{ 'compact': shownCollapsed, 'band-line': line }"
    :style="line ? { '--line': `var(--color-${line.color})` } : undefined"
    @wheel="onHeaderWheel"
  >
    <!-- The controls wrap below the title until the band is wide enough for both, also next to the rail on a tablet. -->
    <div class="strip-top flex items-center gap-5 px-gutter pt-5 max-rail:flex-wrap" :class="{ 'pb-4': !line }">
      <div class="flex min-w-0 flex-1 items-center gap-3 max-md:basis-full">
        <FlowBullet v-if="line" :line="line" on-band class="size-9! text-lead!" />
        <div class="min-w-0">
          <h1 tabindex="-1" class="m-0 font-display outline-none leading-none" :class="line ? 'text-title' : 'text-lead'">
            <FlowIcon :icon="line?.icon" class="mr-[.4em] size-[1.05em] align-[-.15em]" />{{ line ? line.name : viewTitle() }}
          </h1>
          <p v-if="line" class="compact-hide m-0 mt-1.5 truncate text-label text-muted max-md:hidden">
            {{ seenCount }} of {{ plural(line.stops.length, 'hunk') }} seen
          </p>
        </div>
      </div>

      <div class="flex shrink-0 items-center gap-2 max-rail:min-w-0 max-rail:shrink max-rail:flex-wrap">
        <StackSwitch v-if="hasStack()" />
        <span v-if="waitingCount" class="text-label" :class="AGENT_TEXT_COLORS[agentState()]">
          {{ waitingCount === 1 ? '1 request waits for the agent' : `${waitingCount} requests wait for the agent` }}
        </span>
        <UPopover v-if="reviewCount" v-model:open="switcherOpen" :content="{ align: 'end', sideOffset: 6 }">
          <UButton color="neutral" variant="soft" class="font-bold" icon="i-lucide-monitor-dot" :label="plural(reviewCount, 'session')" :aria-label="`${plural(reviewCount, 'session')}: switch review or pause its agent`" trailing-icon="i-lucide-chevron-down" />
          <template #content>
            <div class="max-h-(--reka-popover-content-available-height) w-[min(420px,calc(100vw-32px))] overflow-y-auto p-1.5">
              <section v-for="group in groups" :key="group.repo" class="not-first:mt-2">
                <h3 class="m-0 px-2.5 pt-1 pb-1.5 font-display text-meta tracking-[.1em] text-muted uppercase">{{ group.repo }}</h3>
                <ul role="list" :aria-label="`Reviews in ${group.repo}`" class="m-0 grid list-none gap-0.5 p-0">
                  <SessionRow v-for="review in group.recent" :key="reviewRef(review)" :review="review" />
                </ul>
                <details v-if="group.older.length" class="mt-0.5">
                  <summary class="cursor-pointer px-2.5 py-1.5 text-label text-muted hover:text-toned">{{ group.older.length }} older merged or closed</summary>
                  <ul role="list" class="m-0 grid list-none gap-0.5 p-0">
                    <SessionRow v-for="review in group.older" :key="reviewRef(review)" :review="review" />
                  </ul>
                </details>
              </section>
            </div>
          </template>
        </UPopover>

        <UButton
          v-if="!postedReview() && !state.static"
          color="neutral"
          variant="solid"
          class="font-bold"
          :aria-label="draftLabel"
          :title="draftLabel"
          @click="post('draft')"
        >
          Post as draft
          <UBadge v-if="draftCount" color="warning" variant="solid" size="sm" class="ml-1 rounded-full" aria-hidden="true">
            {{ draftCount }}
          </UBadge>
        </UButton>

        <div class="inline-flex rounded-lg bg-elevated p-0.5" role="group" aria-label="Colour theme">
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
    <!-- On a phone the rail with the PR's name sits below the page, so the header names the PR. -->
    <p v-if="state.view.kind !== 'home'" class="compact-hide m-0 truncate px-gutter pt-2 text-label text-muted md:hidden" :class="{ 'pb-3': !line }">
      <a :href="state.review.pr.url" target="_blank" rel="noopener" class="font-mono text-info underline-offset-3">{{ reviewRef(state.review.pr) }}</a> · <MarkupText :text="state.review.pr.title" />
    </p>

    <HomeHero v-if="state.view.kind === 'home'" />

    <template v-if="line">
      <details v-if="criteria.length" class="criteria compact-hide mx-gutter mt-4 mb-0.5 max-w-[110ch] rounded-card bg-elevated px-3.5 py-2.5" :open="criteriaOpen" @toggle="onCriteriaToggle">
        <summary class="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1.5">
          <span class="font-display text-meta tracking-[.1em] uppercase">This line should</span>
          <AiTag v-if="criteriaHaveVerdicts(line)" label="checked by AI" />
          <span class="criteria-keys flex flex-wrap gap-x-3.5 gap-y-1.5">
            <span v-for="{ id, criterion } in criteria" :key="id" class="inline-flex items-center gap-1.5 font-mono text-label font-semibold text-toned">
              {{ id }}
              <CriterionVerdict v-if="criterion.verdict" :criterion="criterion" />
            </span>
          </span>
        </summary>
        <ul role="list" class="mt-2.5 mb-1.5 grid list-none gap-2.5 p-0">
          <li v-for="{ id, criterion } in criteria" :key="id" class="text-lead font-bold">
            <span class="mr-2.5 font-mono text-label"><MarkupText :text="id" /></span><MarkupText :text="criterion.text" />
            <span
              v-if="criterionSource(criterion)"
              class="ml-2 inline-block rounded-full bg-elevated px-2 py-1 align-[2px] text-tag leading-none font-semibold whitespace-nowrap text-toned"
              :class="{ italic: criterionSource(criterion).kind === 'description' }"
              :title="criterionSource(criterion).title || undefined"
            >{{ criterionSource(criterion).label }}</span>
            <CriterionVerdict v-if="criterion.verdict" :criterion="criterion" class="ml-2.5" :title="criterion.note || undefined" />
          </li>
        </ul>
      </details>
      <div v-else-if="line.noCriteria" class="criteria compact-hide mx-gutter mt-4 mb-0.5 flex max-w-[110ch] flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card bg-elevated px-3.5 py-2.5">
        <span class="font-display text-meta tracking-[.1em] uppercase">This line should</span>
        <p class="m-0 text-ui text-toned">No acceptance criteria to check. <MarkupText :text="line.noCriteria" /></p>
      </div>

      <div v-if="hunk" class="compact-hide mx-gutter mt-6 flex flex-wrap items-end gap-x-5 gap-y-2">
        <span class="font-display text-code tracking-[-.04em] font-black">{{ code }}</span>
        <div class="min-w-0 pb-1">
          <h2 class="m-0 font-mono text-title leading-[1.2] font-semibold break-all">{{ fileName(hunk.file) }}</h2>
          <p class="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2 font-mono text-label text-toned">
            <span class="inline-flex items-baseline gap-1" :title="folder ? `Folder: ${folder}` : 'The file is in the root of the repository'">
              <UIcon name="i-lucide-folder" class="size-3.5 shrink-0 self-center" aria-hidden="true" />
              <span class="sr-only">in folder</span>
              <span class="break-all">{{ folder || 'repository root' }}</span>
            </span>
            <span>· {{ hunk.status }}{{ hunk.oldFile && hunk.oldFile !== hunk.file ? ` from ${hunk.oldFile}` : '' }}<template v-if="hunk.context"> · in {{ hunk.context }}</template></span>
          </p>
        </div>
      </div>

      <details class="legend-wrap compact-hide px-gutter" :open="state.ui.legendOpen" @toggle="state.ui.legendOpen = ($event.target as HTMLDetailsElement).open">
        <summary class="inline-flex cursor-pointer list-none items-center gap-1.5 text-meta text-muted hover:text-toned">
          Legend
        </summary>
        <p class="m-0 flex flex-wrap items-center gap-4 pt-2 text-meta text-muted">
          <span><span class="mr-1.5 inline-block size-4 rounded-full border-3 border-current align-[-3px]" />current hunk (bigger)</span>
          <span><span class="mr-1.5 inline-block size-2.5 rounded-full border-2 border-current align-[-1px]" />not read</span>
          <span><span class="mr-1.5 inline-block size-2.5 rounded-full border-2 border-current bg-current align-[-1px]" />read</span>
          <span v-for="(label, verdict) in { approved: 'you approved', changes: 'you request changes', comment: 'you comment' }" :key="verdict">
            <span class="mr-1.5 inline-grid size-4 place-items-center rounded-full border-2 border-white bg-white align-[-4px]" :class="TICK_ICON_COLORS[verdict]" data-legend-verdict>
              <VerdictIcon :verdict="verdict" :class="verdict === 'approved' ? 'size-2' : 'size-3'" />
            </span>{{ label }}
          </span>
          <span>also in <FlowBullet :line="{ name: 'Flow B', letter: 'B', color: 'line-b' }" mini />: the hunk is part of flow B too</span>
        </p>
      </details>

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
          <div class="absolute top-[34px] right-[66px] left-[66px] h-1.5 rounded-[3px] bg-white/40" />
          <!-- The bar spans the whole line and is scaled to the current stop: a transform animates without a new layout. -->
          <div
            class="absolute top-[34px] left-[66px] h-1.5 origin-left rounded-[3px] bg-white transition-transform duration-[380ms] ease-review motion-reduce:transition-none"
            :style="{ width: `${(stops.length - 1) * STOP_WIDTH}px`, transform: `scaleX(${stops.length > 1 ? index / (stops.length - 1) : 0})` }"
            data-map-done
          />
          <button
            v-for="stop in stops"
            :key="stop.at"
            class="stop group relative w-[132px] flex-[0_0_132px] cursor-[inherit] rounded-md pb-1.5 text-center text-toned focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            :aria-label="stop.label"
            :aria-current="stop.at === index ? 'step' : undefined"
            @click="drag?.moved || go(line.id, stop.at)"
          >
            <span class="block h-7 pt-1 font-mono text-tag leading-none font-bold tracking-[.02em] text-toned">{{ stop.code }}</span>
            <!-- The current stop is bigger and the others are faded, so the eye finds the current one first. -->
            <span
              class="relative mx-auto block rounded-full border-3 transition-[scale] duration-[380ms] ease-review motion-reduce:transition-none"
              :class="[tickClass(stop), stop.at === index && 'scale-[1.7] shadow-[0_0_0_2px_var(--line)]']"
              data-tick
            >
              <VerdictIcon v-if="stop.verdict" :verdict="stop.verdict" :class="stop.verdict === 'approved' ? 'size-2.5' : 'size-3.5'" />
            </span>
            <span
              class="compact-hide mt-3 block truncate px-1 text-meta leading-tight group-hover:text-default group-hover:underline group-hover:underline-offset-3"
              :class="stop.at === index ? 'font-bold text-default' : 'text-toned'"
              :data-path="stop.file"
            >{{ stop.name }}</span>
            <span class="compact-hide mt-0.5 block h-[22px] truncate px-1 text-tag leading-[22px] text-toned">
              <span v-if="stop.fresh" class="rounded-sm bg-white px-1 font-bold text-(--line)">changed</span>
              <template v-if="stop.fresh && stop.others.length"> · </template>
              <template v-if="stop.others.length">also in <FlowBullet v-for="other in stop.others" :key="other.id" :line="other" mini /></template>
            </span>
          </button>
        </div>
        <span class="map-hint end" aria-hidden="true" />
      </nav>
    </template>
  </header>
</template>

<style scoped>
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
.legend-wrap summary::before { width: 5px; height: 5px; }

.map-hint { position: sticky; flex: 0 0 0; align-self: stretch; z-index: 2; pointer-events: none; opacity: 0; transition: opacity .2s var(--ease-review); }
.map-hint.start { left: 0; }
.map-hint.end { right: 0; }
.map-hint::before { content: ""; position: absolute; top: 0; bottom: 0; width: calc(2 * var(--spacing-gutter)); }
.map-hint.start::before { left: calc(-1 * var(--spacing-gutter)); background: linear-gradient(to right, var(--band), transparent); }
.map-hint.end::before { right: calc(-1 * var(--spacing-gutter)); background: linear-gradient(to left, var(--band), transparent); }
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
  .compact .strip-top h1 { font-size: var(--text-lead); }
  .compact .compact-hide { display: none; }
  /* The compact map scrolls with the wheel and by dragging, so it needs no scroll bar under its dots. */
  .compact .map { padding-top: 6px; padding-bottom: 10px; scrollbar-width: none; }
  .compact .map::-webkit-scrollbar { display: none; }
  .compact .stop { padding-bottom: 0; }
}
</style>
