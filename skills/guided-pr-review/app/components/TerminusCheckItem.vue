<script setup lang="ts">
// One row of the Submit review checklist. Its marker turns into a check when the item is done, and its title line
// carries the counts, so a closed row still tells its state. A row with a `section` folds; its open state is kept per section.
const props = withDefaults(defineProps<{ number: number, done?: boolean, section?: string | null, title: string, counts?: string, open?: boolean }>(), { done: false, section: null, counts: '', open: false })
const slots = useSlots()

const isOpen = computed(() => (props.section ? state.ui.terminusOpen?.[props.section] ?? props.open : true))

function onToggle(event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  if (props.section && open !== isOpen.value) state.ui.terminusOpen = { ...state.ui.terminusOpen, [props.section]: open }
}
</script>

<template>
  <li class="mt-2 rounded-card bg-elevated px-5 first:mt-0">
    <component :is="section ? 'details' : 'div'" :id="section ? `term-${section}` : undefined" :open="section ? isOpen : undefined" class="scroll-mt-20" @toggle="onToggle">
      <component :is="section ? 'summary' : 'div'" class="flex list-none items-start gap-3 py-4" :class="{ 'cursor-pointer': section }">
        <span
          class="inline-grid size-7 shrink-0 place-items-center rounded-full font-display text-label leading-none"
          :class="done ? 'bg-success text-inverted' : 'bg-(--ui-text) text-inverted'"
        >
          <template v-if="done"><VerdictIcon verdict="approved" class="size-3" /><span class="sr-only">Done:</span></template>
          <template v-else>{{ number }}</template>
        </span>
        <component :is="section ? 'span' : 'div'" class="flex min-h-6.5 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <component :is="section ? 'span' : 'h3'" class="m-0 flex flex-wrap items-center gap-2 font-display text-lead text-default">
            {{ title }}<slot name="title" />
          </component>
          <span v-if="counts || slots.counts" class="text-ui text-toned"><slot name="counts"><template v-for="(part, index) in counts.split(' · ')" :key="index"><template v-if="index"> · </template><span class="whitespace-nowrap">{{ part }}</span></template></slot></span>
        </component>
      </component>
      <div v-if="slots.default" class="pb-5 pl-10">
        <slot />
      </div>
    </component>
  </li>
</template>

<style scoped>
summary::-webkit-details-marker { display: none; }
</style>
