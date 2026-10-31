<script setup lang="ts">
// Text with inline code and links to tickets and pull requests, from the parts of inlineMarkup.
const props = defineProps<{ text?: string | null }>()

const parts = computed(() => inlineMarkup(props.text))
</script>

<template>
  <template v-for="(part, index) in parts" :key="index">
    <code v-if="part.type === 'code'" class="font-mono text-label">{{ part.text }}</code>
    <a v-else-if="part.type === 'link'" :href="part.url" target="_blank" rel="noopener" :title="part.title" class="text-info underline-offset-3">{{ part.text }}</a>
    <template v-else>{{ part.text }}</template>
  </template>
</template>
