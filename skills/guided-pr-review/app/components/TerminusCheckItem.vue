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
  <li class="border-b border-default">
    <component :is="section ? 'details' : 'div'" :id="section ? `term-${section}` : undefined" :open="section ? isOpen : undefined" class="scroll-mt-20" @toggle="onToggle">
      <component :is="section ? 'summary' : 'div'" class="flex list-none flex-wrap items-center gap-3 py-4" :class="{ 'cursor-pointer': section }">
        <span
          class="inline-grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] text-[12.5px] leading-none font-bold"
          :class="done ? 'border-success bg-success text-inverted' : 'border-accented text-toned'"
        >
          <template v-if="done"><VerdictIcon verdict="approved" class="size-3" /><span class="sr-only">Done:</span></template>
          <template v-else>{{ number }}</template>
        </span>
        <component :is="section ? 'span' : 'h3'" class="m-0 text-[15.5px] font-semibold text-default">
          {{ title }}<slot name="title" />
        </component>
        <span v-if="counts || slots.counts" class="text-[13.5px] text-toned"><slot name="counts">{{ counts }}</slot></span>
      </component>
      <div v-if="slots.default" class="pb-6 pl-[38px]">
        <slot />
      </div>
    </component>
  </li>
</template>

<style scoped>
summary::-webkit-details-marker { display: none; }
</style>
