<script setup lang="ts">
// The acceptance criteria of a PR in a stack: for each one, this PR's verdict and the other PRs that meet it or are expected to.
const coverage = computed(() => coverageRows())
const rows = computed(() => stackRows())
const ticketKeys = computed(() => (state.review.context.tickets || []).map((ticket: { key: string }) => ticket.key).join(', '))

// Each state has a drawn icon and a word, so the state does not depend on colour alone.
const CELLS: Record<string, { icon: string, label: string, color: string }> = {
  'confirmed': { icon: 'i-lucide-check', label: 'confirmed', color: 'text-success' },
  'expected': { icon: 'i-lucide-circle-dashed', label: 'expected', color: 'text-warning' },
  'not-met': { icon: 'i-lucide-x', label: 'not met', color: 'text-error' },
}

// The legend explains only the states the list shows, in this order.
const LEGEND = [
  { state: 'confirmed', icon: 'i-lucide-check', color: 'text-success', name: 'Confirmed', text: "from that PR's full review." },
  { state: 'not-met', icon: 'i-lucide-x', color: 'text-error', name: 'Not met', text: "that PR's full review found it is not met." },
  { state: 'expected', icon: 'i-lucide-circle-dashed', color: 'text-warning', name: 'Expected', text: "from the PR's title, description and files; the code is not read yet." },
  { state: 'none', icon: 'i-lucide-circle-help', color: 'text-warning', name: 'Not found', text: "no PR's title, description or files point to it, and no review confirmed it. A PR may still do it." },
]
const legend = computed(() => {
  const shown = new Set(coverage.value.flatMap((criterion: { none: boolean, cells: Record<number, { status: string }> }) => (criterion.none ? ['none'] : Object.values(criterion.cells).map((cell) => cell.status))))
  return LEGEND.filter((entry) => shown.has(entry.state))
})

// The PRs that say something about a criterion, bottom to top; a stack of many PRs leaves most of them out.
function placesOf(criterion: { cells: Record<number, { status: string, note?: string }> }) {
  return rows.value
    .filter(({ number }: { number: number }) => criterion.cells[number] && CELLS[criterion.cells[number].status])
    .map(({ number, current }: { number: number, current: boolean }) => ({ number, current, cell: criterion.cells[number], look: CELLS[criterion.cells[number].status] }))
}
</script>

<template>
  <div>
  <ul role="list" :aria-label="`Does the stack cover ${ticketKeys}?`" class="m-0 grid list-none p-0">
    <li
      v-for="criterion in coverage"
      :key="criterion.id"
      class="grid grid-cols-[minmax(0,1fr)_minmax(0,15rem)] gap-x-6 gap-y-1.5 border-b border-default py-2.5 text-label last:border-b-0 max-md:grid-cols-1"
    >
      <p class="m-0 max-w-[68ch] text-default">
        <span class="mr-1.5 font-mono font-semibold whitespace-nowrap"><MarkupText :text="criterion.id" /></span><MarkupText :text="criterion.text" />
      </p>
      <p v-if="criterion.none" class="m-0 inline-flex items-start gap-1.5 text-warning">
        <UIcon name="i-lucide-circle-help" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Not found in the stack
      </p>
      <ul v-else role="list" :aria-label="`Where ${criterion.id} is met`" class="m-0 grid list-none gap-1 p-0">
        <li v-for="place in placesOf(criterion)" :key="place.number" class="grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5">
          <UIcon :name="place.look.icon" class="mt-0.5 size-3.5" :class="place.look.color" aria-hidden="true" />
          <span>
            <span class="font-semibold"><MarkupText :text="`#${place.number}`" /></span><span v-if="place.current" class="text-muted">{{ ' (this PR)' }}</span><span class="text-muted">{{ ' · ' }}</span><span :class="place.look.color">{{ place.look.label }}</span>
            <span v-if="place.cell.note" class="block text-muted"><MarkupText :text="place.cell.note" /></span>
          </span>
        </li>
      </ul>
    </li>
  </ul>
  <ul v-if="legend.length" role="list" aria-label="What the marks mean" class="m-0 mt-2 grid list-none gap-1 p-0 text-meta text-muted">
    <li v-for="entry in legend" :key="entry.state" class="grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5">
      <UIcon :name="entry.icon" class="mt-0.5 size-3.5" :class="entry.color" aria-hidden="true" />
      <span><b class="font-semibold" :class="entry.color">{{ entry.name }}</b>: {{ entry.text }}</span>
    </li>
  </ul>
  </div>
</template>
