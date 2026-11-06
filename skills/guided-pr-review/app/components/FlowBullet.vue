<script setup lang="ts">
// The letter of a flow on a solid disk in its colour and shape. `line` is an entry of state.lines.
// Its baseline is the baseline of the letter, so in a line of text it sits centred on that text.
// `hollow` draws the disk as an outline, for "Not on a line"; `onBand` draws it white with the letter in the line colour.
const props = defineProps<{ line: { name: string, letter: string, color: string, shape?: string }, hollow?: boolean, mini?: boolean, onBand?: boolean }>()

// Circle and square are drawn as their own elements; these shapes are paths.
const PATHS: Record<string, string> = {
  diamond: 'M12 1.75 22.25 12 12 22.25 1.75 12z',
  hexagon: 'M12 1.75l9 5.1v10.3l-9 5.1-9-5.1V6.85z',
}
const shape = computed(() => props.line.shape || 'circle')
// On a band the text colours turn white, so a hollow bullet there is a white dashed ring with a white letter.
const fill = computed(() => (props.hollow ? (props.onBand ? 'fill-transparent stroke-white' : 'fill-(--ui-bg) stroke-(--line)') : props.onBand ? 'fill-white stroke-white' : 'fill-(--line) stroke-(--line)'))
const ink = computed(() => (props.hollow ? (props.onBand ? 'text-white' : 'text-default') : props.onBand ? 'text-(--line)' : 'text-white'))
</script>

<template>
  <span
    class="relative inline-grid shrink-0 place-items-center font-display leading-none"
    :class="[mini ? 'ml-1 size-5 text-tag' : 'size-7 text-label', ink]"
    :style="{ '--line': `var(--color-${line.color})` }"
    :title="line.name"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" class="absolute inset-0 size-full overflow-visible [stroke-linejoin:round]" :class="fill" :stroke-width="hollow ? 2.5 : 0" :stroke-dasharray="hollow ? '3 2.5' : undefined">
      <circle v-if="shape === 'circle'" cx="12" cy="12" r="10.5" />
      <rect v-else-if="shape === 'square'" x="2" y="2" width="20" height="20" rx="3" />
      <path v-else :d="PATHS[shape]" />
    </svg>
    <span class="relative pt-[.15em]">{{ line.letter }}</span>
  </span>
</template>
