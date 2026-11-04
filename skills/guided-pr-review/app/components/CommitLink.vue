<script setup lang="ts">
// A commit ID as GitHub shows it: the short form, linked to the commit.
const props = defineProps<{ sha: string }>()

const link = computed(() => commitLink(props.sha, shortSha(props.sha)))
</script>

<template>
  <a :href="link.url" target="_blank" rel="noopener" :title="link.title" class="font-mono text-info underline-offset-3">{{ link.text }}</a>
</template>
