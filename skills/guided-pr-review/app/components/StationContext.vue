<script setup lang="ts">
// What the AI says about a hunk: why it is at this stop, its explanation, and a longer explanation on request.
const props = defineProps<{ hunk: { id: string, explanation?: string, explanationMore?: string }, why?: string }>()

const open = computed(() => state.ui.openExplain.has(props.hunk.id))
const pending = computed(() => explainPending(props.hunk))

function onToggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(props.hunk.id)
  else state.ui.openExplain.delete(props.hunk.id)
}
</script>

<template>
  <section class="mt-[18px] rounded-[10px] border border-default bg-[color-mix(in_srgb,var(--ui-bg-elevated)_45%,transparent)] px-[18px] pt-3.5 pb-3" aria-label="Context written by the AI">
    <AiTag label="AI context" />
    <p v-if="why" class="mt-1.5 mb-0 text-[13.5px] leading-[1.6] text-muted"><b class="font-semibold text-toned">Why here:</b> <MarkupText :text="why" /></p>
    <div class="mt-3.5 max-w-[70ch] text-base leading-[1.65]">
      <p v-if="hunk.explanation" class="mt-0 mb-3"><MarkupText :text="hunk.explanation" /></p>
      <details v-if="hunk.explanationMore" class="explain-more group mt-1 rounded-lg border border-default bg-[color-mix(in_srgb,var(--ui-bg-elevated)_60%,transparent)] text-[14.5px]" :open="open" @toggle="onToggle">
        <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] font-semibold text-default">
          <UIcon name="i-lucide-message-square-text" class="size-[15px]" aria-hidden="true" />
          Longer explanation from the AI
          <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div class="px-3.5 pb-3 text-toned [&>:first-child]:mt-0 [&>:last-child]:mb-0">
          <SafeMarkdown :value="hunk.explanationMore" />
        </div>
      </details>
      <span v-else-if="pending" class="inline-flex items-center gap-2 text-[13px] text-muted">
        <span class="size-2 motion-safe:animate-pulse rounded-full bg-warning" aria-hidden="true" />The AI is writing a longer explanation…
      </span>
      <UButton v-else color="neutral" variant="ghost" icon="i-lucide-message-square-text" class="text-toned" title="Ask the AI for a longer explanation of this hunk" @click="explainMore(hunk.id)">Explain more</UButton>
    </div>
  </section>
</template>

<style scoped>
.explain-more summary::-webkit-details-marker { display: none; }
</style>
