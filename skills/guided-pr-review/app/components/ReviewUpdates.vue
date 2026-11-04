<script setup lang="ts">
// Each kind of change on GitHub comes with the one action that deals with it. The live region reads out a new banner.
// A static page has no agent, so it shows no banners about the agent or GitHub.
const banners = computed(() => (state.static ? [] : updates()))
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
          <p v-else-if="banner.kind === 'paused'" class="m-0">
            <strong>Agent paused.</strong> It does not check GitHub. Questions and posts wait until you resume it.
          </p>
          <div v-else-if="banner.kind === 'preparing'">
            <p class="m-0">
              <strong>The agent is still preparing this review.</strong>
              <template v-if="banner.step"> Now: {{ banner.step }}.</template>
              Findings and explanations can still appear.
            </p>
            <AgentPending text="Preparing…" no-agent-text="No agent runs this review, so the preparation has stopped." class="mt-1" />
          </div>
          <p v-else-if="banner.kind === 'state'" class="m-0">
            <strong>This PR is {{ banner.state }}.</strong> {{ banner.finishing ? 'The agent asks in the chat whether to delete the review data.' : 'A review has little effect now.' }}
          </p>
          <div v-else-if="banner.kind === 'head'">
            <p class="m-0">
              <strong>New commits on this PR.</strong> <template v-if="!banner.updating">Some hunks may have changed since this review was prepared.</template>
            </p>
            <AgentPending v-if="banner.updating" text="The agent is loading the new commits…" class="mt-1" />
          </div>
          <p v-else-if="banner.kind === 'refreshed' && banner.status === 'error'" class="m-0">
            <strong>The agent could not load the new commits: {{ banner.message }}</strong>
          </p>
          <div v-else-if="banner.kind === 'refreshed'">
            <p class="m-0">
              <strong>{{ banner.from === banner.to ? 'No new commits.' : 'Loaded the new commits' }}</strong>
              <template v-if="banner.from !== banner.to">
                (<CommitLink :sha="banner.from" /> → <CommitLink :sha="banner.to" />). {{ banner.counts }}.
              </template>
              The page is up to date; no reload needed.
            </p>
            <div v-if="banner.summary" class="mt-1.5 text-toned [&>:first-child]:mt-0 [&>:last-child]:mb-0">
              <SafeMarkdown :value="banner.summary" />
            </div>
          </div>
          <p v-else-if="banner.kind === 'remote-error'" class="m-0">
            <strong>The agent could not reach GitHub: {{ banner.message }}</strong> The page shows the last state it read.
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
          <template v-if="banner.kind === 'refreshed'">
            <UButton v-if="banner.status === 'error'" color="primary" variant="outline" @click="refresh()">Try again</UButton>
            <UButton v-else-if="state.reviewer.hunkChanges?.added && state.freshHunks.size" color="neutral" variant="soft" @click="showFirstChangedHunk()">Show the first changed hunk</UButton>
            <UButton color="neutral" variant="ghost" @click="closeRefreshResult(banner.eventId)">Close</UButton>
          </template>
          <UButton v-if="banner.kind === 'comments'" color="neutral" variant="soft" @click="showNewComments()">Show</UButton>
          <UButton v-if="banner.kind === 'paused'" color="neutral" variant="soft" icon="i-lucide-play" @click="resumeAgent">Resume</UButton>
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
