<script setup lang="ts">
// Submit review after the final review is posted: what was sent, and what comes next.
const props = defineProps<{ sent: { id: string, at?: string }, finishing: boolean, prOpen: boolean }>()

const COLORS: Record<string, string> = { approved: 'var(--ui-success)', changes: 'var(--ui-error)', comment: 'var(--ui-text-toned)' }
const card = computed(() => postedCard(props.sent))
</script>

<template>
  <div>
    <div
      class="flex flex-wrap items-center gap-x-[18px] gap-y-3.5 rounded-xl border border-(color:--submit-c)/40 bg-(color:--submit-c)/10 px-[22px] py-5"
      :style="{ '--submit-c': COLORS[card.option.icon] || COLORS.comment }"
    >
      <span class="grid size-11 shrink-0 place-items-center rounded-full bg-(--submit-c) text-inverted" aria-hidden="true">
        <VerdictIcon :verdict="card.option.icon" class="size-5" />
      </span>
      <div class="min-w-0 flex-[1_1_220px]">
        <h2 class="m-0 text-[22px] tracking-[-0.015em]">
          {{ card.option.done }}
        </h2>
        <p class="mt-0.5 mb-0 text-sm text-toned">
          Posted to GitHub{{ card.at ? ` at ${timeLabel(card.at)}` : '' }} · {{ card.counts }}
        </p>
      </div>
      <UButton v-if="card.url" :to="card.url" target="_blank" color="neutral" variant="soft" class="font-semibold">
        View on GitHub
      </UButton>
    </div>
    <div class="mt-4 mb-2 flex flex-wrap items-center gap-2.5">
      <template v-if="prOpen">
        <p v-if="finishing" class="m-0 max-w-[68ch] leading-[1.65] text-toned">
          The agent keeps this review. Run the skill again on this PR for the next round.
        </p>
        <UButton v-else color="neutral" class="font-semibold" @click="finish()">
          Finish for now
        </UButton>
      </template>
      <UButton color="neutral" variant="soft" class="font-semibold" @click="goReviews()">
        See it in Existing reviews
      </UButton>
      <UButton color="neutral" variant="ghost" class="text-toned" @click="newRound()">
        Start a new review round
      </UButton>
    </div>
    <p v-if="prOpen" class="mt-0 mb-6 max-w-[68ch] leading-[1.65] text-toned">
      Waiting for the author. New commits start the next round, where you check whether your comments are fixed. Finish for now keeps this review, so that round starts from here.
    </p>
  </div>
</template>
