<script setup lang="ts">
// How to bring back the agent session of a review, from resumeHelp in review.js. `lead` starts the sentence.
defineProps<{ help: { ref: string, command: string | null }, lead?: string }>()
</script>

<template>
  <div>
    <p v-if="!help.command" class="m-0">
      {{ lead }}Ask your agent to resume the guided review of {{ help.ref }}.
    </p>
    <template v-else>
      <p class="m-0">
        {{ lead }}To resume its agent session, run in a terminal:
      </p>
      <code class="mt-1 block rounded-md bg-elevated px-2 py-1.5 font-mono text-meta select-all wrap-anywhere">{{ help.command }}</code>
    </template>
  </div>
</template>
