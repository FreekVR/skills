<script setup lang="ts">
// The AI summary of the review: the button that asks for it and the draft it wrote, from summaryTools in panels.js.
const tools = computed(() => summaryTools())
</script>

<template>
  <div>
    <div v-if="tools.draft" class="mt-2.5 rounded-lg border border-dashed border-accented bg-info/5 px-3.5 py-3">
      <AiTag label="AI draft" />
      <p class="mt-2 mb-1 text-body whitespace-pre-wrap">{{ tools.draft.text }}</p>
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <UButton color="primary" variant="outline" class="font-semibold" @click="useSummaryDraft(tools.draft.eventId)">
          Replace your summary with this
        </UButton>
        <UButton color="neutral" variant="ghost" class="text-toned" @click="dismissSummaryDraft(tools.draft.eventId)">
          Keep yours
        </UButton>
      </div>
    </div>
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span v-if="tools.waiting" class="inline-flex items-center gap-2 text-label text-dimmed">
        <span class="size-2 motion-safe:animate-pulse rounded-full bg-warning" aria-hidden="true" />The agent is writing a summary…
      </span>
      <UButton v-else color="neutral" variant="ghost" icon="i-lucide-sparkles" class="-ml-2.5 text-toned" :disabled="!tools.count" @click="summarize()">
        {{ state.reviewer.summary.trim() ? 'Write a new summary from your remarks' : 'Write a summary from your remarks' }}
      </UButton>
      <span class="text-label text-dimmed">{{ tools.count ? `Uses the ${plural(tools.count, 'remark')} that will be posted.` : 'Accept a finding or write a remark first.' }}</span>
    </div>
  </div>
</template>
