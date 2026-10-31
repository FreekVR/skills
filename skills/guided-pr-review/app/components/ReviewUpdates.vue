<script setup lang="ts">
// Each kind of change on GitHub comes with the one action that deals with it. The live region reads out a new banner.
const banners = computed(() => updates())
</script>

<template>
  <div class="sticky top-0 z-4 page-column" :class="banners.length ? 'pt-3 max-md:pt-2' : 'pt-0'" aria-live="polite">
    <TransitionGroup tag="div" class="grid gap-2" enter-active-class="banner-arrive">
      <UAlert
        v-for="banner in banners"
        :key="banner.key"
        color="neutral"
        variant="outline"
        orientation="horizontal"
        :role="banner.kind === 'offline' ? 'alert' : undefined"
        class="border border-(--ui-text-muted) bg-elevated text-ui shadow-[0_4px_16px_rgba(0,0,0,.12)] ring-0"
        :ui="{ description: 'mt-0 text-default text-ui leading-normal', actions: 'shrink-0' }"
      >
        <template #description>
          <template v-if="banner.kind === 'offline'">
            <p class="m-0"><strong>This review is not running.</strong> The page cannot save your work or reach the agent.</p>
            <ResumeHelp :help="banner.resume" />
          </template>
          <p v-else-if="banner.kind === 'state'" class="m-0">
            <strong>This PR is {{ banner.state }}.</strong> {{ banner.finishing ? 'The agent asks in the chat whether to delete the review data.' : 'A review has little effect now.' }}
          </p>
          <p v-else-if="banner.kind === 'head'" class="m-0">
            <strong>New commits on this PR.</strong> {{ banner.updating ? 'The agent is loading the new commits…' : 'Some hunks may have changed since this review was prepared.' }}
          </p>
          <p v-else-if="banner.kind === 'comments'" class="m-0">
            <strong>{{ plural(banner.count, 'new comment') }}</strong> by {{ banner.authors.map((author: string) => `@${author}`).join(', ') }}.
          </p>
        </template>
        <template #actions>
          <UButton v-if="banner.kind === 'state' && !banner.finishing" color="neutral" variant="soft" @click="finish()">Finish the review</UButton>
          <template v-if="banner.kind === 'head'">
            <UButton v-if="banner.updating" color="neutral" variant="ghost" @click="refresh()">Ask again</UButton>
            <UButton v-else color="primary" variant="outline" @click="refresh()">Load the new commits</UButton>
            <UButton v-if="banner.canStartRound" color="neutral" variant="soft" @click="newRound()">Start a new review round</UButton>
          </template>
          <UButton v-if="banner.kind === 'comments'" color="neutral" variant="soft" @click="showNewComments()">Show</UButton>
        </template>
      </UAlert>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.banner-arrive { animation: drop-in .34s var(--ease-review); }
@keyframes drop-in { from { opacity: 0; transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { .banner-arrive { animation: none; } }
</style>
