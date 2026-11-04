<script setup lang="ts">
const position = computed(() => stackPosition())
const rows = computed(() => stackRows())
const label = computed(() => `Stack · ${position.value.index} of ${position.value.size}`)

// This page's row needs no link. A merged or closed PR without a review links to GitHub.
function linkOf(row: { current: boolean, action: string, url: string, status: { page: string } | null }) {
  if (row.action === 'open' && !row.current) return { href: row.status?.page }
  if (row.action === 'github') return { href: row.url, target: '_blank', rel: 'noopener' }
  return null
}
</script>

<template>
  <UPopover :content="{ align: 'end', sideOffset: 6 }">
    <UButton color="neutral" variant="outline" class="font-semibold" :label="label" :aria-label="`${label}: switch to another PR of the stack`" trailing-icon="i-lucide-chevron-down" />
    <template #content>
      <div class="w-[min(440px,calc(100vw-32px))] p-1.5 [--line:var(--ui-primary)]">
        <p class="m-0 px-2.5 pt-1.5 pb-2 text-meta font-extrabold tracking-[.08em] text-muted uppercase">
          Stack<template v-if="state.review.stack.number"> #{{ state.review.stack.number }}</template> · bottom to top
        </p>
        <ul role="list" aria-label="PRs in this stack, bottom to top" class="m-0 grid list-none p-0">
          <li
            v-for="(row, at) in rows"
            :key="row.number"
            class="relative flex items-start gap-3 rounded-md px-2.5 py-2 text-label"
            :class="row.current && 'bg-elevated ring-1 ring-accented'"
            :aria-current="row.current ? 'page' : undefined"
          >
            <!-- The line runs from the first stop to the last; each row draws its own part of it. -->
            <span
              class="absolute left-[17.5px] w-1.5 bg-[color-mix(in_srgb,var(--line)_45%,var(--ui-bg))]"
              :style="{ top: at === 0 ? '17px' : '0', height: at === rows.length - 1 ? '17px' : undefined, bottom: at === rows.length - 1 ? undefined : '0' }"
              aria-hidden="true"
            />
            <span class="relative grid w-[21px] shrink-0 place-items-center pt-0.5" aria-hidden="true">
              <span class="block rounded-full border-3" :class="stackDotClass(row)" />
            </span>
            <div class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-x-1.5">
                <component
                  :is="linkOf(row) ? 'a' : 'span'"
                  v-bind="linkOf(row)"
                  :class="linkOf(row) ? 'text-default no-underline hover:underline hover:underline-offset-3' : row.current && 'font-semibold'"
                ><span class="text-info">#{{ row.number }}</span> {{ row.title }}</component>
                <span v-if="row.current" class="rounded-sm px-1.5 text-tag text-muted ring-1 ring-accented">this page</span>
                <span v-if="row.state === 'merged'" class="rounded-sm px-1.5 text-tag text-muted ring-1 ring-accented">merged</span>
              </span>
              <span class="block" :class="row.approved ? 'text-success' : 'text-muted'">
                {{ stackRowLabel(row) }}<template v-if="row.action === 'start' && !state.static"> · <UButton variant="link" color="info" size="sm" class="p-0 align-baseline text-label" label="Start a review" @click="startReview(row.number)" /></template>
              </span>
            </div>
          </li>
        </ul>
        <p class="m-0 px-2.5 pt-1 pb-1.5 font-mono text-meta text-muted">
          base: {{ state.review.stack.base }}
        </p>
      </div>
    </template>
  </UPopover>
</template>
