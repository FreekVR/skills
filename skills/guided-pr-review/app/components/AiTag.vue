<script setup lang="ts">
// Marks text the agent wrote, so the reviewer never takes it for the author's or another reviewer's words.
// An empty label shows only the sparkle, for a line whose own text already says it comes from the AI.
// It has no margin: in a line of text, give it `mr-1.5`; in a flex row, the gap of the row spaces it.
withDefaults(defineProps<{ label?: string }>(), { label: 'AI' })
</script>

<template>
  <!-- inline-block: its baseline is the baseline of its text, so in a line of text it sits on that line.
       Without a label it keeps the font size of the line, so its centre is the centre of that text. -->
  <UBadge
    color="neutral"
    variant="outline"
    size="sm"
    class="inline-block shrink-0 rounded-full py-1 whitespace-nowrap text-toned"
    :class="label ? 'text-tag leading-3 font-semibold' : 'px-1 text-[1em] leading-3'"
    title="Written by the AI agent"
  >
    <!-- The centre of the icon is the centre of the text: 0.355em above the baseline, less half the icon. -->
    <UIcon name="i-lucide-sparkles" class="size-3 align-[calc(.355em-6px)]" :class="label && 'mr-1'" aria-hidden="true" />{{ label }}
  </UBadge>
</template>
