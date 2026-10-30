<script setup lang="ts">
// The letter of a flow in its colour and shape. `line` is an entry of state.lines.
const props = defineProps<{ line: { name: string, letter: string, color: string, shape?: string }, hollow?: boolean, mini?: boolean }>()

// Circle and square are drawn as their own elements; these shapes are paths.
const PATHS: Record<string, string> = {
  diamond: 'M12 1.75 22.25 12 12 22.25 1.75 12z',
  hexagon: 'M12 1.75l9 5.1v10.3l-9 5.1-9-5.1V6.85z',
}
const shape = computed(() => props.line.shape || 'circle')
const stroke = computed(() => (props.mini ? 3 : props.hollow ? 2.5 : 3.5))
</script>

<template>
  <span
    class="relative inline-grid shrink-0 place-items-center font-bold leading-none text-default"
    :class="mini ? 'ml-1 size-4.5 align-middle text-tag' : 'size-6 text-tag'"
    :style="{ '--line': `var(--color-${line.color})` }"
    :title="line.name"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" class="absolute inset-0 size-full overflow-visible fill-(--ui-bg) stroke-(--line) [stroke-linejoin:round]" :stroke-width="stroke">
      <circle v-if="shape === 'circle'" cx="12" cy="12" r="9.5" />
      <rect v-else-if="shape === 'square'" x="3" y="3" width="18" height="18" rx="2.5" />
      <path v-else :d="PATHS[shape]" />
    </svg>
    <span class="relative">{{ line.letter }}</span>
  </span>
</template>
