<script setup lang="ts">
// The stack on Home: one AI line per PR, and for each acceptance criterion the PRs that meet it.
const stack = computed(() => state.review.stack)
const rows = computed(() => stackRows())
const coverage = computed(() => coverageRows())
const outside = computed(() => outsideTicketRows())
const ticketKeys = computed(() => (state.review.context.tickets || []).map((ticket: { key: string }) => ticket.key).join(', '))

// Each state has a drawn icon and a word, so the state does not depend on colour alone.
const CELLS: Record<string, { icon: string, label: string, color: string }> = {
  'confirmed': { icon: 'i-lucide-check', label: 'confirmed', color: 'text-success' },
  'expected': { icon: 'i-lucide-circle-dashed', label: 'expected', color: 'text-warning' },
  'not-met': { icon: 'i-lucide-x', label: 'not met', color: 'text-error' },
}

// The PRs that say something about a criterion, bottom to top; a stack of many PRs leaves most of them out.
function placesOf(criterion: { cells: Record<number, { status: string, note?: string }> }) {
  return rows.value
    .filter(({ number }: { number: number }) => criterion.cells[number] && CELLS[criterion.cells[number].status])
    .map(({ number, current }: { number: number, current: boolean }) => ({ number, current, cell: criterion.cells[number], look: CELLS[criterion.cells[number].status] }))
}
</script>

<template>
  <section class="mt-5 rounded-lg border border-default bg-elevated/60 px-4 py-3.5 text-body [--line:var(--ui-primary)]" aria-labelledby="home-stack">
    <h3 id="home-stack" class="m-0 text-ui font-semibold">
      This PR in its stack <span class="text-label font-normal text-muted">· stack<template v-if="stack.number"> #{{ stack.number }}</template>, {{ stack.prs.length }} PRs, base {{ stack.base }}</span>
    </h3>
    <ul role="list" aria-label="PRs in this stack, bottom to top" class="m-0 mt-3 grid list-none p-0">
      <li
        v-for="(row, at) in rows"
        :key="row.number"
        class="relative grid grid-cols-[21px_1fr_minmax(0,180px)] items-start gap-3 rounded-md px-2.5 py-2 text-label max-md:grid-cols-[21px_1fr]"
        :class="row.current && 'bg-elevated ring-1 ring-accented'"
        :aria-current="row.current ? 'page' : undefined"
      >
        <!-- The line runs from the first stop to the last; each row draws its own part of it, as in the stack switch. -->
        <span
          class="absolute left-[17.5px] w-1.5 bg-[color-mix(in_srgb,var(--line)_45%,var(--ui-bg))]"
          :style="{ top: at === 0 ? '17px' : '0', height: at === rows.length - 1 ? '17px' : undefined, bottom: at === rows.length - 1 ? undefined : '0' }"
          aria-hidden="true"
        />
        <span class="relative grid place-items-center pt-0.5" aria-hidden="true">
          <span class="block rounded-full border-3" :class="stackDotClass(row)" />
        </span>
        <div class="min-w-0">
          <span class="flex flex-wrap items-center gap-x-1.5" :class="row.current && 'font-semibold'">
            <span><MarkupText :text="`#${row.number}`" /> {{ row.title }}</span>
            <span v-if="row.current" class="rounded-sm px-1.5 text-tag font-normal text-muted ring-1 ring-accented">this page</span>
            <AiTag v-else-if="stack.prs[at]?.summary" />
          </span>
          <span v-if="stack.prs[at]?.summary" class="block text-toned"><MarkupText :text="stack.prs[at].summary" /></span>
        </div>
        <span class="max-md:col-start-2" :class="row.approved ? 'text-success' : 'text-muted'">{{ stackRowLabel(row) }}</span>
      </li>
    </ul>

    <template v-if="coverage.length">
      <h4 id="home-stack-coverage" class="mt-5 mb-2 text-ui font-semibold">
        Does the stack cover {{ ticketKeys }}?
      </h4>
      <ul role="list" aria-labelledby="home-stack-coverage" class="m-0 grid list-none p-0">
        <li
          v-for="criterion in coverage"
          :key="criterion.id"
          class="grid grid-cols-[minmax(0,1fr)_minmax(0,15rem)] gap-x-6 gap-y-1.5 border-b border-default py-2.5 text-label last:border-b-0 max-md:grid-cols-1"
        >
          <p class="m-0 max-w-[68ch] text-default">
            <span class="mr-1.5 font-mono font-semibold whitespace-nowrap"><MarkupText :text="criterion.id" /></span><MarkupText :text="criterion.text" />
          </p>
          <p v-if="criterion.none" class="m-0 inline-flex items-start gap-1.5 font-semibold text-error">
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />In no PR of the stack
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
      <p class="mt-2 mb-0 flex flex-wrap gap-x-4 gap-y-1 text-meta text-muted">
        <span class="inline-flex items-center gap-1"><UIcon name="i-lucide-circle-dashed" class="size-3.5 text-warning" aria-hidden="true" /><span><b class="font-semibold text-warning">Expected</b>: from the PR's title, description and files; the code is not read yet.</span></span>
        <span class="inline-flex items-center gap-1"><UIcon name="i-lucide-check" class="size-3.5 text-success" aria-hidden="true" /><span><b class="font-semibold text-success">Confirmed</b>: from that PR's full review.</span></span>
      </p>
    </template>

    <template v-if="outside.length">
      <h4 class="mt-4 mb-1 text-label font-semibold">
        Outside the tickets <AiTag class="ml-1" />
      </h4>
      <ul role="list" class="m-0 grid list-disc gap-1 pl-5 text-label text-toned">
        <li v-for="(change, index) in outside" :key="index">
          <MarkupText :text="`#${change.pr}`" /> <MarkupText :text="change.text" /> <span class="text-muted">({{ CELLS[change.status]?.label || change.status }})</span>
        </li>
      </ul>
    </template>
  </section>
</template>
