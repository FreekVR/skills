<script setup lang="ts">
// Open while the agent waits for an answer in the chat. Closing it holds for that question only.
const open = computed({
  get: () => Boolean(state.waiting) && state.waiting.since !== state.ui.waitingClosed,
  set: (value: boolean) => { if (!value && state.waiting) state.ui.waitingClosed = state.waiting.since },
})
</script>

<template>
  <UModal v-model:open="open" title="The agent is waiting for your answer in the chat" :dismissible="false" :close="false" :ui="{ content: 'w-[min(480px,calc(100vw-32px))]', footer: 'justify-start' }">
    <template #body>
      <p class="m-0 font-semibold">{{ state.waiting?.question }}</p>
      <p class="mb-0 mt-3 text-ui text-toned">Answer it in the chat where the agent runs. Questions and posts you send meanwhile can wait until you answer.</p>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="soft" @click="close()">Read the review meanwhile</UButton>
    </template>
  </UModal>
</template>
