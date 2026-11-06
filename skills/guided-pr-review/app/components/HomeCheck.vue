<script setup lang="ts">
import { SEVERITY_CLASSES } from './DiffSeverity.vue'

// One check on Home: a disc in the severity colour of its worst item, the problem in one line, and its detail in place.
// `level` is the severity level 0 to 3 and `severity` its name, or null when nothing in the check has a severity; the disc is
// then grey. A screen reader hears the severity, which the disc only shows as a colour.
const props = defineProps<{ id: string, level: number | null, severity: string | null, icon: string, title: string, line?: string }>()

const ICONS: Record<string, string> = { bad: 'i-lucide-circle-x', warn: 'i-lucide-triangle-alert', finding: 'i-lucide-circle-alert', comment: 'i-lucide-message-square' }
const open = computed(() => state.ui.openExplain.has(`check-${props.id}`))

// A check remembers that it is open, so a redraw or a return to Home keeps it open.
function onToggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(`check-${props.id}`)
  else state.ui.openExplain.delete(`check-${props.id}`)
}
</script>

<template>
  <details :id="`home-${id}`" class="group border-t border-default first:border-t-0" :open="open" @toggle="onToggle">
    <summary class="flex cursor-pointer list-none items-start gap-3.5 py-4 [&::-webkit-details-marker]:hidden">
      <span
        class="mt-0.5 grid size-6.5 shrink-0 place-items-center rounded-full"
        :class="level === null ? 'bg-(--ui-text-muted) text-inverted' : SEVERITY_CLASSES[level]"
        :data-check-level="level === null ? 'none' : level"
        aria-hidden="true"
      >
        <UIcon :name="ICONS[icon]" class="size-3.5" />
      </span>
      <span class="min-w-0 flex-1">
        <b class="block font-display text-lead leading-snug"><span v-if="severity" class="sr-only">{{ severity }}: </span>{{ title }}</b>
        <span v-if="line" class="mt-0.5 block truncate text-ui text-toned group-open:whitespace-normal"><MarkupText :text="line" /></span>
      </span>
      <UIcon name="i-lucide-chevron-down" class="mt-1.5 size-4 shrink-0 text-dimmed transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div class="pb-5 pl-10">
      <slot />
    </div>
  </details>
</template>
