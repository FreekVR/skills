<script setup lang="ts">
// A reply in a thread on GitHub. It waits in the page until the reviewer posts their review or an update.
// `open` shows the text field at once, for a thread left open; `aiDraft` is the agent's draft reply, if the text started from it.
const props = defineProps<{ threadId: string, open?: boolean, aiDraft?: string }>()

const asked = ref(false)
const text = computed({
  get: () => state.reviewer.threadReplies[props.threadId] ?? '',
  set: (value: string) => setThreadReply(props.threadId, value),
})
const shown = computed(() => asked.value || props.open || text.value !== '')
</script>

<template>
  <UButton v-if="!shown" color="neutral" variant="ghost" icon="i-lucide-reply" class="text-toned" @click="asked = true">
    Reply
  </UButton>
  <div v-else class="mt-2 basis-full">
    <AiTag v-if="aiDraft && text.trim() === aiDraft.trim()" label="AI draft" class="mb-1.5" />
    <UTextarea v-model="text" aria-label="Reply in this thread" placeholder="Your reply" :rows="3" autoresize :autofocus="asked" class="w-full" />
    <p class="mt-1 mb-0 text-meta text-muted">
      Posted in this thread when you post your review or an update. Leave it empty for no reply.
    </p>
  </div>
</template>
