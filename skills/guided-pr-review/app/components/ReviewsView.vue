<script setup lang="ts">
// Existing reviews: the reviews on GitHub, the reviewer's own first. Their newest one is current.
const reviews = computed(() => existingReviews())
</script>

<template>
  <section class="max-w-[1080px] px-11 pt-9 pb-24 max-[820px]:px-4">
    <p v-if="!reviews.reviews.length" class="mt-0 mb-6 max-w-[68ch] leading-[1.65] text-toned">
      Nobody has reviewed this PR yet.
    </p>
    <div v-if="reviews.mine.length" class="mt-10">
      <h2 class="m-0 mb-1.5 text-lg tracking-[-0.01em]">
        Your reviews
      </h2>
      <ReviewsCard v-for="(review, index) in reviews.mine" :key="review.id" :review="review" :current="index === 0" />
    </div>
    <div v-if="reviews.others.length" class="mt-10">
      <h2 class="m-0 mb-1.5 text-lg tracking-[-0.01em]">
        Other reviewers
      </h2>
      <ReviewsCard v-for="review in reviews.others" :key="review.id" :review="review" :current="false" />
    </div>
  </section>
</template>
