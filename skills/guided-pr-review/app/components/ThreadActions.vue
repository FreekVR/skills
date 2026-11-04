<script setup lang="ts">
// Resolve a posted comment of the reviewer or leave it open, or unresolve a resolved thread, from threadActions().
// The AI's recommendation is the stronger button. Once the reviewer chose, the buttons give way to their choice, so the card shows that it is recorded.
const props = defineProps<{ own: { threadId?: string, resolved?: boolean, canResolve?: boolean, canUnresolve?: boolean, fix?: { verdict: string, reply?: string } } }>()

const actions = computed(() => threadActions(props.own))

const BUTTONS = [
  { call: 'resolve', label: 'Resolve', verdict: 'approved', color: 'success' as const },
  { call: 'open', label: 'Leave open', verdict: 'changes', color: 'error' as const },
  { call: 'unresolve', label: 'Unresolve', verdict: 'comment', color: 'neutral' as const },
  { call: 'keep', label: 'Keep resolved', verdict: 'approved', color: 'success' as const },
]
const buttons = computed(() => BUTTONS.filter((button) => actions.value?.calls.includes(button.call)))

const CHOSEN: Record<string, { title: string, text: string, tone: string }> = {
  resolve: { title: 'You resolve this comment.', text: 'GitHub marks it resolved when you post your next review.', tone: 'border-success/40 bg-success/8 [--tone:var(--ui-success)]' },
  open: { title: 'You leave this comment open.', text: 'It stays open on GitHub.', tone: 'border-error/40 bg-error/8 [--tone:var(--ui-error)]' },
  keep: { title: 'You keep this comment resolved.', text: 'Nothing changes on GitHub.', tone: 'border-success/40 bg-success/8 [--tone:var(--ui-success)]' },
  unresolve: { title: 'You unresolve this comment.', text: 'GitHub opens it again when you post your next review.', tone: 'border-accented bg-default [--tone:var(--ui-text-muted)]' },
}
const chosen = computed(() => {
  const call = actions.value?.call
  return call ? { ...CHOSEN[call]!, verdict: BUTTONS.find((button) => button.call === call)!.verdict } : null
})
</script>

<template>
  <template v-if="actions">
    <div v-if="chosen" class="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-md border px-3 py-2 text-ui" :class="chosen.tone" role="status">
      <span class="grid size-5 shrink-0 place-items-center rounded-full bg-(--tone) text-inverted" aria-hidden="true">
        <VerdictIcon :verdict="chosen.verdict" class="size-3" />
      </span>
      <b class="font-semibold">{{ chosen.title }}</b>
      <span class="text-toned">{{ chosen.text }}</span>
      <UButton color="neutral" variant="link" size="sm" class="ml-auto p-0 text-info underline underline-offset-3" @click="setThreadCall(actions.threadId, null)">
        Change
      </UButton>
    </div>
    <div class="flex flex-wrap items-center gap-2" :class="chosen ? 'mt-1' : 'mt-2.5'">
      <div v-if="!chosen && buttons.length" class="inline-flex flex-wrap gap-2" role="group" aria-label="Your decision on this comment">
        <UButton
          v-for="button in buttons"
          :key="button.call"
          :color="button.color"
          variant="outline"
          class="font-semibold"
          :class="actions.suggested && actions.suggested !== button.call && 'not-hover:not-focus-visible:text-muted not-hover:not-focus-visible:ring-accented'"
          @click="setThreadCall(actions.threadId, button.call)"
        >
          <VerdictIcon :verdict="button.verdict" class="size-3.5" />{{ button.label }}
        </UButton>
      </div>
      <ThreadReply v-if="actions.canReply" :thread-id="actions.threadId" :open="actions.call === 'open'" :ai-draft="own.fix?.reply" />
    </div>
  </template>
</template>
