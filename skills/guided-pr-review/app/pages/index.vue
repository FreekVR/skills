<script setup lang="ts">
const { data: reviews } = await useFetch<{ owner: string, repo: string, number: number, title: string }[]>('/api/reviews')
</script>

<template>
  <main>
    <ul>
      <li v-for="review in reviews" :key="`${review.owner}/${review.repo}/${review.number}`">
        <NuxtLink :to="`/${review.owner}/${review.repo}/${review.number}`">{{ review.owner }}/{{ review.repo }}#{{ review.number }} {{ review.title }}</NuxtLink>
      </li>
    </ul>
  </main>
</template>
