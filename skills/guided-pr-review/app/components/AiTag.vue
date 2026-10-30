<script setup lang="ts">
// Marks text the agent wrote, so the reviewer never takes it for the author's or another reviewer's words.
withDefaults(defineProps<{ label?: string }>(), { label: 'AI' })
</script>

<template>
  <UBadge color="neutral" variant="outline" size="sm" icon="i-lucide-sparkles" class="mr-1.5 rounded-full align-[1px] font-semibold whitespace-nowrap text-toned" title="Written by the AI agent">
    {{ label }}
  </UBadge>
</template>
