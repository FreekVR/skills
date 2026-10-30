<script setup lang="ts">
// The result of one post to GitHub, from postResult in panels.js.
defineProps<{ result: { status: string, text: string, url?: string } }>()
</script>

<template>
  <div
    :role="result.status === 'posted' || result.status === 'pending' ? 'status' : 'alert'"
    class="mb-1.5 rounded-md border px-3 py-2 text-[13.5px]"
    :class="result.status === 'posted' ? 'border-success' : result.status === 'pending' ? 'border-default' : 'border-error text-error'"
  >
    <span v-if="result.status === 'pending'" class="inline-flex items-center gap-2 text-[13px] text-dimmed">
      <span class="size-2 motion-safe:animate-pulse rounded-full bg-warning" aria-hidden="true" />{{ result.text }}
    </span>
    <template v-else>
      {{ result.text }}<template v-if="result.url">
        {{ ' ' }}<a :href="result.url" target="_blank" rel="noopener" class="text-info underline underline-offset-3">Open on GitHub</a>
      </template>
    </template>
  </div>
</template>
