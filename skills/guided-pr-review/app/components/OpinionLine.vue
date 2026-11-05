<script setup lang="ts">
// What the AI thinks of a comment, from opinionLine(), drawn as a reply balloon under the comment.
// `own` marks the reviewer's own comment, so the line says whose comment the AI judged.
const props = defineProps<{ opinion?: { stance?: string, text?: string } | null, own?: boolean }>()

// The balloon's tint carries the stance: green agrees, blue is not sure, red disagrees.
// The fill is the tint mixed with the page colour, not see-through: a see-through tail would show the border behind it.
const TINTS: Record<string, string> = { agree: '[--tint:var(--ui-success)]', unsure: '[--tint:var(--ui-info)]', disagree: '[--tint:var(--ui-error)]' }
const line = computed(() => opinionLine(props.opinion))
</script>

<template>
  <p
    v-if="line"
    class="relative mt-4 mb-0 max-w-[72ch] rounded-xl border border-[color-mix(in_srgb,var(--tint)_30%,var(--ui-bg))] bg-[color-mix(in_srgb,var(--tint)_10%,var(--ui-bg))] px-3.5 py-2 text-ui text-toned before:absolute before:-top-1.5 before:left-5 before:size-3 before:rotate-45 before:border-t before:border-l before:border-inherit before:bg-inherit"
    :class="TINTS[line.kind] || TINTS.unsure"
  >
    <AiTag label="" class="mr-1.5" /><b class="font-semibold text-default">AI on {{ own ? 'your' : 'this' }} comment: {{ line.label }}.</b> <MarkupText :text="line.text" />
  </p>
</template>
