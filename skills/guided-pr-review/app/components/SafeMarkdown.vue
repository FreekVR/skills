<script lang="ts">
import breaks from 'comark/plugins/breaks'
import html from 'comark/plugins/html'

// One set of plugins for every comment on the page. GitHub shows a single line break in a comment as a new line,
// and links references to issues, pull requests and commits.
const PLUGINS = [html(), githubHtml(), breaks(), githubLinks(linkReferences)]
</script>

<script setup lang="ts">
defineProps<{ value: string }>()
</script>

<template>
  <!-- Comment text comes from other people: HTML passes GitHub's allowlist, and component syntax stays plain text. -->
  <Markdown :value="value" :options="{ registerDefaultPlugins: false }" :plugins="PLUGINS" />
</template>
