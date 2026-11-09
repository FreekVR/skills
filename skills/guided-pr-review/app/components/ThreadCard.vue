<script setup lang="ts">
// One comment thread of a review on GitHub: where it is, its code, the conversation and what to do with it.
// `mine` threads get the call to resolve or leave open; threads of others can be copied to the reviewer's own review. Any resolved thread can be unresolved.
type Comment = {
  id: string, author?: string, body: string, hunkId?: string | null, path?: string, line?: number, side?: string, diffHunk?: string,
  resolved?: boolean, resolvedBy?: string, outdated?: boolean, threadId?: string, canResolve?: boolean, canUnresolve?: boolean,
  replies?: { author: string, body: string, at?: string }[], opinion?: { stance?: string, text?: string }, fix?: { verdict: string, note?: string, reply?: string },
}
const props = defineProps<{ comment: Comment, mine: boolean }>()

// Every flow that passes the hunk of this comment, each with the stop where it does.
const stations = computed(() => (props.comment.hunkId ? stationsOf(props.comment.hunkId) : []) as { line: { id: string, name: string, letter: string, color: string }, index: number }[])
const copied = computed(() => isCopied(props.comment))
const reasons = computed(() => (props.mine && !threadCall(props.comment) ? checkReasons(props.comment) : []))
const folded = computed(() => isCollapsed(props.comment.id, props.comment))
</script>

<template>
  <div
    class="thread mt-3.5 scroll-mt-6 rounded-lg border-r-8 px-3.5 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
    :class="[reasons.length ? 'border-r-warning bg-[color-mix(in_srgb,var(--ui-warning)_9%,var(--ui-bg-elevated))]' : 'border-r-accented bg-elevated']"
    :data-needs-decision="reasons.length ? '' : undefined"
    :tabindex="reasons.length ? -1 : undefined"
  >
    <p v-if="reasons.length" class="mt-0 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
      <span class="inline-flex items-center gap-1 font-semibold text-warning"><UIcon name="i-lucide-circle-alert" class="size-3.5" aria-hidden="true" />Needs your decision</span>
      <span class="text-toned">{{ reasons.join(' · ') }}</span>
    </p>
    <!-- The AI's take stays in view while the thread is collapsed. -->
    <FixLine :item="comment" class="mt-0! mb-2.5" />
    <NoteFold :id="comment.id" :folded="folded">
      <template #head>
        <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span class="font-mono text-label wrap-anywhere text-toned">{{ threadPlace(comment) }}</span>
          <span v-if="comment.outdated" class="text-label text-dimmed">outdated</span>
          <span v-if="stations.length" class="ml-auto inline-flex flex-wrap items-center gap-1 text-label text-toned">
            Show in flow
            <UButton
              v-for="station in stations"
              :key="station.line.id"
              color="neutral"
              variant="ghost"
              size="sm"
              square
              :aria-label="`Show this comment in the flow ${station.line.name}`"
              :title="station.line.name"
              @click="showComment(comment.id, station.line.id, station.index)"
            >
              <FlowBullet :line="station.line" class="size-5! text-tag!" />
            </UButton>
          </span>
          <span v-if="comment.resolved" class="text-meta font-semibold">{{ resolvedByOthers(comment) ? `Resolved by @${comment.resolvedBy}` : 'Resolved' }}{{ threadCall(comment) === 'unresolve' ? ' · you unresolve it' : '' }}</span>
        </div>
      </template>
      <ThreadCode :comment="comment" />
      <CommentConversation :comment="comment">
        <template #first>
          <OpinionLine v-if="!comment.resolved" :opinion="comment.opinion" :own="mine" />
        </template>
      </CommentConversation>
      <ThreadActions v-if="mine || comment.resolved" :own="comment" />
      <div v-if="!mine" class="mt-2 flex flex-wrap items-center gap-1.5">
        <span v-if="copied" class="text-meta text-dimmed">Copied to your review</span>
        <UButton v-else color="neutral" variant="ghost" size="sm" class="text-toned" @click="copyComment(comment)">
          Copy to my review
        </UButton>
        <ThreadReply v-if="comment.threadId && !comment.resolved" :thread-id="comment.threadId" />
      </div>
    </NoteFold>
  </div>
</template>
