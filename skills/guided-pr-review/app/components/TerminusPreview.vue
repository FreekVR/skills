<script setup lang="ts">
// What the post sends to GitHub: the review body, each line comment, each reply in a thread and each thread it resolves.
const props = defineProps<{ post: { body: string, comments: { path: string, line: number, side: string, start_line?: number, body: string }[], replies?: { threadId: string, body: string }[], resolve?: string[] } }>()

const comments = computed(() => props.post.comments.map((comment) => ({
  ...comment,
  place: `${comment.path} ${comment.start_line ? `lines ${comment.start_line}–${comment.line}` : `line ${comment.line}`}${comment.side === 'LEFT' ? ' (old)' : ''}`,
})))
</script>

<template>
  <div class="mt-2.5 divide-y divide-default rounded-lg border border-default">
    <div class="px-4.5 py-3.5">
      <div class="font-mono text-meta text-dimmed">
        Review body
      </div>
      <div v-if="post.body" class="preview-text mt-1 text-ui">
        <SafeMarkdown :value="post.body" />
      </div>
      <p v-else class="mt-1 mb-0 text-ui text-dimmed">
        Empty
      </p>
    </div>
    <div v-for="(comment, index) in comments" :key="index" class="px-4.5 py-3.5">
      <div class="font-mono text-meta text-dimmed">
        {{ comment.place }}
      </div>
      <div class="preview-text mt-1 text-ui">
        <SafeMarkdown :value="comment.body" />
      </div>
    </div>
    <div v-for="reply in post.replies || []" :key="reply.threadId" class="px-4.5 py-3.5">
      <div class="font-mono text-meta text-dimmed">
        Reply to {{ threadLabel(reply.threadId) }}
      </div>
      <div class="preview-text mt-1 text-ui">
        <SafeMarkdown :value="reply.body" />
      </div>
    </div>
    <div v-for="threadId in post.resolve || []" :key="`resolve-${threadId}`" class="flex items-center gap-2 px-4.5 py-3.5 font-mono text-meta text-dimmed">
      <VerdictIcon verdict="approved" class="size-3.5 text-success" />Resolve {{ threadLabel(threadId) }}
    </div>
  </div>
</template>

<style scoped>
.preview-text > :deep(:first-child) { margin-top: 0; }
.preview-text > :deep(:last-child) { margin-bottom: 0; }
</style>
