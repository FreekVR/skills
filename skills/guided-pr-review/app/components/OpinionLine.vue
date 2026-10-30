<script setup lang="ts">
// What the AI thinks of a comment, from opinionLine().
const props = defineProps<{ opinion?: { stance?: string, text?: string } | null }>()

const ICON_COLORS: Record<string, string> = { agree: 'bg-success', disagree: 'bg-error', unsure: 'bg-(--ui-text-muted)' }
const line = computed(() => opinionLine(props.opinion))
</script>

<template>
  <p v-if="line" class="mt-3 mb-0 flex max-w-[72ch] items-start gap-2.5 rounded-lg border border-default bg-[color-mix(in_srgb,var(--ui-bg)_70%,transparent)] px-3 py-2 text-ui text-toned">
    <span class="mt-px grid size-5 shrink-0 place-items-center rounded-full text-inverted" :class="ICON_COLORS[line.kind]" aria-hidden="true">
      <VerdictIcon :verdict="line.icon" class="size-3" />
    </span>
    <span><b class="font-semibold text-default">{{ line.label }}.</b> <MarkupText :text="line.text" /></span>
  </p>
</template>
