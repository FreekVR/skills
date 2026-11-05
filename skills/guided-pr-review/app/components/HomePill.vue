<script setup lang="ts">
// A rounded label in the colour of a tone: ok, warn, bad, info or quiet. Warn and bad fill solid, so they stand out first.
const props = defineProps<{ tone: string }>()
const variant = computed(() => (['warn', 'bad'].includes(props.tone) ? 'solid' : 'soft'))

const COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = { ok: 'success', warn: 'warning', bad: 'error', info: 'info', quiet: 'neutral' }
</script>

<template>
  <UBadge :color="COLORS[tone] || 'neutral'" :variant="variant" class="rounded-full px-2.5 text-label font-bold whitespace-nowrap">
    <slot />
  </UBadge>
</template>
