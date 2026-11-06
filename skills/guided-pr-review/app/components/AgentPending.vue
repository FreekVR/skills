<script setup lang="ts">
// A request that waits for the agent. `text` is the place's own words for the working state;
// a review without an agent says why the request waits.
withDefaults(defineProps<{ text: string, noAgentText?: string }>(), { noAgentText: 'No agent runs this review, so this request waits.' })

const agent = computed(() => agentState())
const pr = computed(() => agentPr() as { owner: string, repo: string, number: number | string })
const help = computed(() => resumeHelp({ ...pr.value, session: state.agent?.session }))

</script>

<template>
  <div v-if="agent === 'none'" class="grid gap-1 text-label text-warning">
    <span>{{ noAgentText }}</span>
    <ResumeHelp :help="help" class="text-muted" />
  </div>
  <span v-else class="inline-flex items-center gap-2 text-label text-muted">
    <span class="size-2 motion-safe:animate-pulse rounded-full bg-warning" aria-hidden="true" />{{ text }}
  </span>
</template>
