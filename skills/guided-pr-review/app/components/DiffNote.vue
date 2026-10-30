<script setup lang="ts">
// A note on the diff: a comment by someone else, an AI finding, a remark of the reviewer, or a remark they posted earlier.
interface NoteItem {
  id: string
  author?: string
  url?: string
  body: string
  title?: string
  rule?: string
  severity: string
  line?: number
  startLine?: number
  side?: string
  startSide?: string
  resolved?: boolean
  threadId?: string
  replies?: { author: string, body: string, at?: string }[]
  opinion?: { stance?: string, text?: string }
  fix?: { verdict: string, note?: string, reply?: string }
}
const props = defineProps<{ note: { type: 'comment' | 'finding' | 'remark' | 'posted', item: NoteItem } }>()

const item = computed(() => props.note.item)
const BLOCK = 'relative border-y border-default px-5 pt-4 pb-[18px] font-sans whitespace-normal'
</script>

<template>
  <!-- Comment by someone else -->
  <div v-if="note.type === 'comment'" :class="BLOCK">
    <div class="flex flex-wrap items-baseline gap-2.5">
      <UAvatar :src="avatar(item.author)" alt="" size="xs" class="-mr-0.5 self-center bg-elevated ring-1 ring-default" />
      <span class="text-xs text-muted">
        <b><a v-if="item.url" :href="item.url" target="_blank" rel="noopener" class="text-info underline-offset-3">@{{ item.author }}</a><template v-else>@{{ item.author }}</template></b>
        commented{{ item.line ? ` on ${lineLabel(item)}` : '' }} · not your remark, not posted again
      </span>
    </div>
    <CommentConversation v-if="item.replies?.length" :comment="item" />
    <div v-else class="mt-2 max-w-[72ch] text-sm leading-[1.65] [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <SafeMarkdown :value="item.body" />
    </div>
    <FixLine :item="item" />
    <OpinionLine :opinion="item.opinion" />
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <span v-if="isCopied(item)" class="text-xs text-muted">Copied to your review</span>
      <UButton v-else color="neutral" variant="ghost" size="sm" class="text-toned" @click="copyComment(item)">Copy to my review</UButton>
    </div>
  </div>

  <!-- A remark the reviewer posted in an earlier round -->
  <div v-else-if="note.type === 'posted'" :class="BLOCK">
    <div class="flex flex-wrap items-baseline gap-2.5">
      <UAvatar :src="avatar(viewerLogin())" alt="" size="xs" class="-mr-0.5 self-center bg-elevated ring-1 ring-default" />
      <DiffSeverity :severity="item.severity" />
      <span class="text-xs text-muted">You posted this earlier<template v-if="item.url"> · <a :href="item.url" target="_blank" rel="noopener" class="text-info underline-offset-3">open on GitHub</a></template>. It is not posted again.</span>
    </div>
    <CommentConversation v-if="item.replies?.length" :comment="item" />
    <p v-else class="mt-2 mb-0 max-w-[72ch] text-sm leading-[1.65] whitespace-pre-wrap"><MarkupText :text="item.body" /></p>
    <template v-if="!item.resolved">
      <FixLine :item="item" />
      <OpinionLine :opinion="item.opinion" />
    </template>
    <ThreadActions :own="item" />
  </div>

  <!-- An AI finding or a remark of the reviewer -->
  <NoteCard v-else :type="note.type" :item="item" />
</template>
