<script setup lang="ts">
defineProps<{ value: string }>()
</script>

<template>
  <!-- Comment text comes from other people: without the default plugins, raw HTML and component syntax stay plain text. -->
  <Markdown :value="value" :options="{ registerDefaultPlugins: false }" />
</template>
