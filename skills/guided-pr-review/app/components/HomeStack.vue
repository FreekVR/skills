<script setup lang="ts">
// The stack on Home: one AI line per PR, and the changes that no ticket asks for. The criteria are in Before you start.
const stack = computed(() => state.review.stack)
const rows = computed(() => stackRows())
const outside = computed(() => outsideTicketRows())

</script>

<template>
  <section class="mt-5 rounded-card bg-elevated px-4.5 py-4 text-body [--line:var(--ui-primary)]" aria-labelledby="home-stack">
    <h3 id="home-stack" class="m-0 font-display text-lead">
      This PR in its stack <span class="text-label font-normal text-muted">· stack<template v-if="stack.number"> #{{ stack.number }}</template>, {{ stack.prs.length }} PRs, base {{ stack.base }}</span>
    </h3>
    <ul role="list" aria-label="PRs in this stack, bottom to top" class="m-0 mt-3 grid list-none p-0">
      <li
        v-for="(row, at) in rows"
        :key="row.number"
        class="relative grid grid-cols-[21px_1fr_minmax(0,180px)] items-start gap-3 rounded-md px-2.5 py-2 text-label max-md:grid-cols-[21px_1fr]"
        :class="row.current && 'bg-default'"
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
            <span v-if="row.current" class="rounded-sm bg-(--ui-text) px-1.5 text-tag font-semibold text-inverted">this page</span>
            <AiTag v-else-if="stack.prs[at]?.summary" />
          </span>
          <span v-if="stack.prs[at]?.summary" class="block text-toned"><MarkupText :text="stack.prs[at].summary" /></span>
        </div>
        <span class="max-md:col-start-2" :class="row.approved ? 'text-success' : 'text-muted'">{{ stackRowLabel(row) }}</span>
      </li>
    </ul>

    <template v-if="outside.length">
      <h4 class="mt-4 mb-1 text-label font-semibold">
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
