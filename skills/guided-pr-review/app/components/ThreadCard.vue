<script setup lang="ts">
// One comment thread of a review on GitHub: where it is, its code, the conversation and what to do with it.
// `mine` threads get the call to resolve or leave open; threads of others can be copied to the reviewer's own review.
type Comment = {
  id: string, author?: string, body: string, hunkId?: string | null, path?: string, line?: number, side?: string, diffHunk?: string,
  resolved?: boolean, outdated?: boolean, threadId?: string, canResolve?: boolean,
  replies?: { author: string, body: string, at?: string }[], opinion?: { stance?: string, text?: string }, fix?: { verdict: string, note?: string, reply?: string },
}
const props = defineProps<{ comment: Comment, mine: boolean }>()

const at = computed(() => (props.comment.hunkId ? firstStationOf(props.comment.hunkId) : null))
const copied = computed(() => isCopied(props.comment))
</script>

<template>
  <component :is="comment.resolved ? 'details' : 'div'" class="thread mt-3.5 rounded-lg border border-default bg-elevated" :class="comment.resolved ? 'px-3.5 py-2' : 'px-3.5 py-3'">
    <component :is="comment.resolved ? 'summary' : 'div'" class="flex list-none flex-wrap items-center gap-x-2.5 gap-y-1.5" :class="{ 'cursor-pointer': comment.resolved }">
      <span class="font-mono text-[12.5px] leading-[1.4] wrap-anywhere text-toned">{{ threadPlace(comment) }}</span>
      <span v-if="comment.outdated" class="text-[13px] text-dimmed">outdated</span>
      <UButton
        v-if="at"
        color="neutral"
        variant="ghost"
        size="sm"
        class="ml-auto text-toned"
        title="Open this hunk in its flow"
        @click="go(at.line.id, at.index)"
      >
        Show in flow
      </UButton>
      <span v-if="comment.resolved" class="text-xs font-semibold">Resolved</span>
    </component>
    <ThreadCode :comment="comment" />
    <CommentConversation :comment="comment" />
    <template v-if="!comment.resolved">
      <FixLine :item="comment" />
      <OpinionLine :opinion="comment.opinion" />
    </template>
    <ThreadActions v-if="mine" :own="comment" />
    <div v-else class="mt-2 flex flex-wrap items-center gap-1.5">
      <span v-if="copied" class="text-xs text-dimmed">Copied to your review</span>
      <UButton v-else color="neutral" variant="ghost" size="sm" class="text-toned" @click="copyComment(comment)">
        Copy to my review
      </UButton>
    </div>
  </component>
</template>

<style scoped>
summary::-webkit-details-marker { display: none; }
</style>
