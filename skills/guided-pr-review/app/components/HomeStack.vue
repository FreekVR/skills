<script setup lang="ts">
// The stack on Home: one AI line per PR, and for each acceptance criterion the PRs that meet it.
const stack = computed(() => state.review.stack)
const rows = computed(() => stackRows())
const coverage = computed(() => coverageRows())
const outside = computed(() => outsideTicketRows())
const ticketKeys = computed(() => (state.review.context.tickets || []).map((ticket: { key: string }) => ticket.key).join(', '))

const CELLS: Record<string, { icon: string, label: string, color: string }> = {
  'confirmed': { icon: '✓', label: 'confirmed', color: 'text-success' },
  'expected': { icon: '○', label: 'expected', color: 'text-warning' },
  'not-met': { icon: '✕', label: 'not met', color: 'text-error' },
}

// Each PR column of a criterion row, with the cell and how it looks.
function cellsOf(criterion: { cells: Record<number, { status: string, note?: string }> }) {
  return rows.value.map(({ number }: { number: number }) => {
    const cell = criterion.cells[number]
    return { number, cell, look: cell && CELLS[cell.status] }
  })
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
      <div class="overflow-x-auto">
        <table aria-labelledby="home-stack-coverage" class="w-full border-collapse text-label">
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <th class="py-2 pr-3 font-semibold">
                Acceptance criterion
              </th>
              <th v-for="row in rows" :key="row.number" class="px-3 py-2 text-center font-semibold whitespace-nowrap">
                #{{ row.number }}<template v-if="row.current">
                  · this
                </template>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="criterion in coverage" :key="criterion.id" class="border-b border-default">
              <td class="py-2 pr-3">
                <span class="mr-1.5 font-mono font-semibold"><MarkupText :text="criterion.id" /></span><MarkupText :text="criterion.text" />
              </td>
              <td v-if="criterion.none" :colspan="rows.length" class="px-3 py-2 text-right font-semibold text-error">
                no PR
              </td>
              <template v-else>
                <td v-for="{ number, cell, look } in cellsOf(criterion)" :key="number" class="px-3 py-2 text-center">
                  <template v-if="look">
                    <span class="whitespace-nowrap" :class="look.color">{{ look.icon }} {{ look.label }}</span>
                    <span v-if="cell.note" class="block text-muted"><MarkupText :text="cell.note" /></span>
                  </template>
                </td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="mt-2 mb-0 text-meta text-muted">
        <span class="text-warning">○ expected</span>: from the PR's title, description and files; not read.
        <span class="text-success">✓ confirmed</span>: from that PR's full review.
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
