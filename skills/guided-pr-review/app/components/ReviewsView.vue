<script setup lang="ts">
// Existing reviews: the reviews on GitHub, the reviewer's own first. Their newest one is current.
const reviews = computed(() => existingReviews())
const toCheck = computed(() => threadsToCheck().length)
const reducedMotion = usePreferredReducedMotion()

// Finds the next comment in page order, not by index: a decision takes a comment out of the list, so an index would skip one.
let last: Element | null = null
async function nextToDecide() {
  const all = [...document.querySelectorAll<HTMLElement>('[data-needs-decision]')]
  const target = all.find((el) => last?.isConnected && last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || all[0]
  if (!target) return
  for (let details = target.closest('details'); details; details = details.parentElement?.closest('details') ?? null) details.open = true
  await nextTick()
  target.scrollIntoView({ behavior: reducedMotion.value === 'reduce' ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
  last = target
}
</script>

<template>
  <section class="page-column pt-10 pb-24">
    <p v-if="!reviews.reviews.length" class="mt-0 mb-6 max-w-[68ch] leading-[1.65] text-toned">
      Nobody has reviewed this PR yet.
    </p>
    <div v-else class="mb-2 grid gap-1.5 text-ui text-toned">
      <p class="m-0">
        This page shows commit <code class="font-mono">{{ shortSha(state.review.pr.headSha) }}</code>.
      </p>
      <p v-if="toCheck" class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span><b class="font-semibold text-warning">{{ toCheck }} of your comments {{ toCheck === 1 ? 'needs' : 'need' }} your decision</b>: choose Resolve or Leave open.</span>
        <UButton color="neutral" variant="link" size="sm" class="p-0 text-info underline underline-offset-3" @click="nextToDecide()">
          {{ toCheck === 1 ? 'Go to it' : 'Go to the first' }}
        </UButton>
      </p>
    </div>
    <div v-if="reviews.mine.length" class="mt-10 first:mt-0">
      <h2 class="m-0 mb-1.5 text-lead tracking-[-0.01em]">
        Your reviews
      </h2>
      <ReviewsCard v-for="(review, index) in reviews.mine" :key="review.id" :review="review" :current="index === 0" />
    </div>
    <div v-if="reviews.others.length" class="mt-10 first:mt-0">
      <h2 class="m-0 mb-1.5 text-lead tracking-[-0.01em]">
        Other reviewers
      </h2>
      <ReviewsCard v-for="review in reviews.others" :key="review.id" :review="review" :current="false" />
    </div>
    <div v-if="toCheck" class="pointer-events-none sticky bottom-4 z-10 mt-8 flex justify-end">
      <UButton color="neutral" variant="solid" size="lg" class="pointer-events-auto font-semibold shadow-[0_4px_14px_rgba(0,0,0,.18)]" trailing-icon="i-lucide-arrow-down" @click="nextToDecide()">
        Next comment to decide
        <UBadge color="warning" variant="solid" size="sm" class="tabular-nums">{{ toCheck }}</UBadge>
      </UButton>
    </div>
  </section>
</template>
