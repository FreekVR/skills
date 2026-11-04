<script setup lang="ts">
// The result of one post to GitHub, from postResult in panels.js.
defineProps<{ result: { status: string, text: string, url?: string } }>()
</script>

<template>
  <div
    :role="result.status === 'posted' || result.status === 'pending' ? 'status' : 'alert'"
    class="mb-1.5 rounded-lg px-3.5 py-2.5 text-ui"
    :class="result.status === 'posted' ? 'bg-[color-mix(in_srgb,var(--ui-success)_12%,var(--ui-bg))]' : result.status === 'pending' ? 'bg-elevated' : 'bg-[color-mix(in_srgb,var(--ui-error)_12%,var(--ui-bg))] text-error'"
  >
    <AgentPending v-if="result.status === 'pending'" :text="result.text" />
    <template v-else>
      {{ result.text }}<template v-if="result.url">
        {{ ' ' }}<a :href="result.url" target="_blank" rel="noopener" class="text-info underline underline-offset-3">Open on GitHub</a>
      </template>
    </template>
  </div>
</template>
