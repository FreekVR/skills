<script setup lang="ts">
// The stack on Home, as a vertical line bottom to top, like the stack switch and GitHub's stack list; the horizontal
// line is the flow map of this PR. A deep stack shows this PR and its neighbours, and folds the rest into one row below
// and one above; "Show all" opens them in place. The criteria and the stack's coverage of them are in the criteria check.
const FOLD_FROM = 8
const stack = computed(() => state.review.stack)
const rows = computed(() => stackRows())
const outside = computed(() => outsideTicketRows())
const current = computed(() => rows.value.findIndex((row: { current: boolean }) => row.current))
const expanded = computed(() => state.ui.openExplain.has('stack'))
const folds = computed(() => rows.value.length >= FOLD_FROM && !expanded.value)

type Row = ReturnType<typeof stackRows>[number]
const below = computed(() => (folds.value ? rows.value.slice(0, Math.max(0, current.value - 1)) : []))
const above = computed(() => (folds.value ? rows.value.slice(current.value + 2) : []))
const shown = computed(() => (folds.value ? rows.value.slice(Math.max(0, current.value - 1), current.value + 2) : rows.value))
// The list in order, with a fold row in place of each folded run.
const items = computed(() => [
  ...(below.value.length ? [{ fold: 'below', rows: below.value }] : []),
  ...shown.value.map((row: Row) => ({ fold: null, row })),
  ...(above.value.length ? [{ fold: 'above', rows: above.value }] : []),
])

function foldLabel(item: { fold: string, rows: Row[] }) {
  const numbers = `#${item.rows[0].number} to #${item.rows.at(-1).number}`
  return item.fold === 'below' ? `${plural(item.rows.length, 'PR')} below: ${numbers}` : `${plural(item.rows.length, 'PR')} above: ${numbers}`
}
// Merged PRs count as merged only; reviewed and not reviewed count the open ones.
function foldNote(item: { rows: Row[] }) {
  const merged = item.rows.filter((row) => row.state === 'merged').length
  const open = item.rows.filter((row) => row.state !== 'merged')
  if (!open.length) return 'all merged'
  const reviewed = open.filter((row) => row.status?.hasReview || row.approved).length
  return [merged && `${merged} merged`, reviewed && `${reviewed} reviewed`, open.length - reviewed && `${open.length - reviewed} not reviewed`].filter(Boolean).join(', ')
}

// The box grows or shrinks to its new height while the opened rows fade in, so the page below moves smoothly.
const list = useTemplateRef<HTMLElement>('list')
const reducedMotion = usePreferredReducedMotion()
async function toggle() {
  const element = list.value
  const from = element?.getBoundingClientRect().height ?? 0
  if (expanded.value) state.ui.openExplain.delete('stack')
  else state.ui.openExplain.add('stack')
  if (!element || reducedMotion.value === 'reduce') return
  await nextTick()
  const to = element.getBoundingClientRect().height
  element.animate([{ height: `${from}px`, overflow: 'hidden' }, { height: `${to}px`, overflow: 'hidden' }], { duration: 300, easing: 'cubic-bezier(.33, 1, .68, 1)' })
}
</script>

<template>
  <section class="mt-6 max-w-[640px] rounded-card bg-elevated px-5 py-4 text-label [--line:var(--ui-primary)]" aria-label="This PR in its stack">
    <div class="flex flex-wrap items-center gap-x-3">
      <h3 class="m-0 text-meta font-normal text-muted">
        Stack<template v-if="stack.number"> #{{ stack.number }}</template> · {{ stack.prs.length }} PRs · base {{ stack.base }}
      </h3>
      <UButton v-if="rows.length >= FOLD_FROM" color="neutral" variant="link" size="xs" class="ml-auto min-h-6 p-0 text-info" :aria-expanded="expanded" @click="toggle()">
        {{ expanded ? 'Show less' : `Show all ${rows.length}` }}
      </UButton>
    </div>
    <div ref="list">
      <TransitionGroup tag="ul" name="stack-row" role="list" aria-label="PRs in this stack, bottom to top" class="relative m-0 mt-1.5 grid list-none p-0">
        <li
          v-for="(item, at) in items"
          :key="item.fold || item.row.number"
          class="relative grid grid-cols-[21px_1fr] items-start gap-2.5 rounded-md px-2 py-1.5"
          :class="item.row?.current && 'bg-default'"
          :aria-current="item.row?.current ? 'page' : undefined"
        >
          <!-- Each row draws its own part of the line, from the first stop to the last. -->
          <span
            class="absolute left-[16.5px] w-1 bg-[color-mix(in_srgb,var(--line)_35%,var(--ui-bg))]"
            :style="{ top: at === 0 ? '15px' : '0', height: at === items.length - 1 ? '15px' : undefined, bottom: at === items.length - 1 ? undefined : '0' }"
            aria-hidden="true"
          />
          <span class="relative grid place-items-center pt-0.5" aria-hidden="true">
            <span v-if="item.fold" class="block size-3.5 rounded-full border-2 border-dashed border-(--ui-text-muted) bg-accented" />
            <span v-else class="block rounded-full border-3" :class="stackDotClass(item.row)" />
          </span>
          <button v-if="item.fold" class="min-w-0 cursor-pointer text-left" :aria-expanded="false" @click="toggle()">
            <span class="block text-info">{{ foldLabel(item) }}</span>
            <span class="block text-meta text-muted">{{ foldNote(item) }}</span>
          </button>
          <div v-else class="min-w-0" :title="item.row.summary || undefined">
            <span class="flex flex-wrap items-center gap-x-1.5" :class="item.row.current && 'font-semibold'">
              <span><MarkupText :text="`#${item.row.number}`" /> {{ item.row.title }}</span>
              <span v-if="item.row.current" class="rounded-sm bg-(--ui-text) px-1.5 text-tag font-semibold text-inverted">this page</span>
            </span>
            <span class="block text-meta" :class="item.row.approved ? 'text-success' : 'text-muted'">{{ stackRowLabel(item.row) }}</span>
          </div>
        </li>
      </TransitionGroup>
    </div>

    <template v-if="outside.length">
      <h4 class="mt-3 mb-1 text-label font-semibold">
        Outside the tickets <AiTag class="ml-1" />
      </h4>
      <ul role="list" class="m-0 grid list-disc gap-1 pl-5 text-label text-toned">
        <li v-for="(change, index) in outside" :key="index">
          <MarkupText :text="`#${change.pr}`" /> <MarkupText :text="change.text" /> <span class="text-muted">({{ change.status }})</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
.stack-row-enter-active { transition: opacity .3s var(--ease-review), transform .3s var(--ease-review); }
.stack-row-enter-from { opacity: 0; transform: translateY(-6px); }
</style>
