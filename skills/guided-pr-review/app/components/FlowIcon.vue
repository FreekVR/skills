<script setup lang="ts">
// The icon of a flow. Its name comes from the review data, so the build cannot bundle it; svg mode fetches it from the server.
const props = defineProps<{ icon?: string }>()

const name = computed(() => (/^[a-z0-9-]+$/.test(props.icon || '') ? `lucide:${props.icon}` : null))
</script>

<template>
  <Icon v-if="name" :name="name" mode="svg" class="inline-block shrink-0" aria-hidden="true" />
</template>
