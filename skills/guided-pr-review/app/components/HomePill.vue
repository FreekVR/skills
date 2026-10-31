<script setup lang="ts">
// A rounded label in the colour of a tone: ok, warn, bad, info or quiet.
defineProps<{ tone: string }>()

const COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = { ok: 'success', warn: 'warning', bad: 'error', info: 'info', quiet: 'neutral' }
</script>

<template>
  <UBadge :color="COLORS[tone] || 'neutral'" variant="subtle" class="rounded-full px-2.5 text-label font-semibold whitespace-nowrap">
    <slot />
  </UBadge>
</template>
