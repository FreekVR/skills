<script setup lang="ts">
// What the post sends to GitHub: the review body and each line comment.
const props = defineProps<{ post: { body: string, comments: { path: string, line: number, side: string, start_line?: number, body: string }[] } }>()

const comments = computed(() => props.post.comments.map((comment) => ({
  ...comment,
  place: `${comment.path} ${comment.start_line ? `lines ${comment.start_line}–${comment.line}` : `line ${comment.line}`}${comment.side === 'LEFT' ? ' (old)' : ''}`,
})))
</script>

<template>
  <div class="mt-2.5 divide-y divide-default rounded-lg border border-default">
    <div class="px-[18px] py-3.5">
      <div class="font-mono text-xs leading-[1.4] text-dimmed">
        Review body
      </div>
      <div v-if="post.body" class="preview-text mt-1 text-sm leading-[1.6]">
        <SafeMarkdown :value="post.body" />
      </div>
      <p v-else class="mt-1 mb-0 text-sm text-dimmed">
        Empty
      </p>
    </div>
    <div v-for="(comment, index) in comments" :key="index" class="px-[18px] py-3.5">
      <div class="font-mono text-xs leading-[1.4] text-dimmed">
        {{ comment.place }}
      </div>
      <div class="preview-text mt-1 text-sm leading-[1.6]">
        <SafeMarkdown :value="comment.body" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.preview-text > :deep(:first-child) { margin-top: 0; }
.preview-text > :deep(:last-child) { margin-bottom: 0; }
</style>
