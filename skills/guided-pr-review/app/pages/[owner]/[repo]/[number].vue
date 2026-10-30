<script setup lang="ts">
const route = useRoute()
const base = computed(() => `/api/reviews/${route.params.owner}/${route.params.repo}/${route.params.number}`)
const { data: review } = await useFetch<{ pr: { title: string } }>(() => `${base.value}/review`)
</script>

<template>
  <main>
    <h1 v-if="review">{{ review.pr.title }}</h1>
  </main>
</template>
