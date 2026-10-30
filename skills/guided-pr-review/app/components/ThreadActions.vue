<script setup lang="ts">
// Resolve a posted comment of the reviewer or leave it open, from threadActions(). The AI's recommendation is the stronger button.
const props = defineProps<{ own: { threadId?: string, resolved?: boolean, canResolve?: boolean, fix?: { verdict: string, reply?: string } } }>()

const actions = computed(() => threadActions(props.own))
const reply = computed({
  get: () => actions.value?.reply ?? '',
  set: (text: string) => setThreadReply(actions.value!.threadId, text),
})

const BUTTONS = [
  { call: 'resolve', label: 'Resolve', verdict: 'approved', color: 'success' as const },
  { call: 'open', label: 'Leave open', verdict: 'changes', color: 'error' as const },
]
const buttons = computed(() => BUTTONS.filter((button) => button.call !== 'resolve' || actions.value?.canResolve))
</script>

<template>
  <p v-if="actions?.resolved" class="mt-2.5 mb-0 text-meta text-muted">
    Resolved on GitHub.
  </p>
  <template v-else-if="actions">
    <div class="mt-2.5 inline-flex flex-wrap gap-2" role="group" aria-label="Your call on this comment">
      <UButton
        v-for="button in buttons"
        :key="button.call"
        :color="button.color"
        :variant="actions.call === button.call ? 'solid' : 'outline'"
        :aria-pressed="actions.call === button.call"
        class="font-semibold"
        :class="actions.suggested && actions.suggested !== button.call && actions.call !== button.call && 'not-hover:not-focus-visible:text-muted not-hover:not-focus-visible:ring-accented'"
        @click="setThreadCall(actions.threadId, button.call)"
      >
        <VerdictIcon :verdict="button.verdict" class="size-3.5" />{{ button.label }}
      </UButton>
    </div>
    <div v-if="actions.call === 'open'" class="mt-2">
      <UTextarea v-model="reply" aria-label="Reply in this thread" placeholder="Optional: what is still missing?" :rows="3" autoresize class="w-full" />
      <p class="mt-1 mb-0 text-meta text-muted">
        Posted as a reply in the thread when you post the review. Leave it empty for no reply.{{ actions.replyFromAi ? ' The text starts as the AI draft.' : '' }}
      </p>
    </div>
  </template>
</template>
