<script lang="ts">
import html from 'comark/plugins/html'

// One set of plugins for every comment on the page.
const PLUGINS = [html(), githubHtml()]
</script>

<script setup lang="ts">
defineProps<{ value: string }>()
</script>

<template>
  <!-- Comment text comes from other people: HTML passes GitHub's allowlist, and component syntax stays plain text. -->
  <Markdown :value="value" :options="{ registerDefaultPlugins: false }" :plugins="PLUGINS" />
</template>
