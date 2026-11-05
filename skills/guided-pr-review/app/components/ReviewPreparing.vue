<script setup lang="ts">
// The page of a PR without review.json: the agent prepares the review, or it stopped before it wrote it.
const page = computed(() => state.preparing as { owner: string, repo: string, number: number, from?: number })
const preparing = computed(() => state.agent?.preparing as { step: string | null } | null)
</script>

<template>
  <main id="main" class="page-column grid gap-3 py-12">
    <p class="m-0 font-mono text-meta text-muted">
      {{ page.owner }}/{{ page.repo }}#{{ page.number }}
    </p>
    <template v-if="preparing">
      <h1 class="m-0 text-display font-bold tracking-[-.02em]">
        The agent is preparing this review
      </h1>
      <p v-if="preparing.step" class="m-0 text-toned">
        Now: {{ preparing.step }}.
      </p>
      <AgentPending text="Preparing…" />
      <p class="m-0 max-w-[68ch] leading-[1.65] text-toned">
        The review opens on this page when the agent has written it. You do not have to reload.
      </p>
    </template>
    <template v-else>
      <h1 class="m-0 text-display font-bold tracking-[-.02em]">
        The agent has not written this review
      </h1>
      <p class="m-0 max-w-[68ch] leading-[1.65] text-toned">
        Start it again from the stack switch of the review it came from, or ask the agent in the chat.
      </p>
    </template>
    <p v-if="page.from" class="m-0">
      <a :href="`/${page.owner}/${page.repo}/${page.from}`" class="text-info">Back to the review of #{{ page.from }}</a>
    </p>
  </main>
</template>
