<script setup lang="ts">
// Where a text stands: only on this page, in a GitHub draft, posted, or changed since it was posted.
const props = defineProps<{ id: string, body: string }>()

const COLORS: Record<string, 'neutral' | 'warning' | 'success'> = { local: 'neutral', draft: 'warning', changed: 'warning', posted: 'success' }
const badge = computed(() => statusBadge(props.id, props.body))
</script>

<template>
  <UBadge
    :color="COLORS[badge.status] || 'neutral'"
    variant="outline"
    size="sm"
    class="rounded-full px-2 py-1 text-[11px] leading-none font-semibold tracking-[.02em] whitespace-nowrap"
    :class="badge.status === 'local' && 'border border-dashed border-(--ui-text-muted) text-toned ring-0'"
    :title="badge.hint || undefined"
  >
    {{ badge.label }}<span v-if="badge.hint" class="sr-only"> {{ badge.hint }}</span>
  </UBadge>
</template>
