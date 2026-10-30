<script setup lang="ts">
// A colleague's open comment that is not on a hunk of the diff. It is not the reviewer's remark and is not posted again.
type Reply = { author: string, body: string, at?: string }
type Comment = { id: string, author: string, body: string, url?: string, line?: number, replies?: Reply[], fix?: { verdict: string, note?: string }, resolved?: boolean, opinion?: { stance: string, text: string } }
defineProps<{ comment: Comment }>()
</script>

<template>
  <div class="border-t border-default py-4 first:border-t-0">
    <div class="flex flex-wrap items-center gap-2.5">
      <UAvatar :src="avatar(comment.author)" alt="" size="xs" />
      <span class="text-[13px] text-muted">
        <b class="text-default"><a v-if="comment.url" :href="comment.url" target="_blank" rel="noopener">@{{ comment.author }}</a><template v-else>@{{ comment.author }}</template></b>
        commented<template v-if="comment.line"> on {{ lineLabel(comment) }}</template> · not your remark, not posted again
      </span>
    </div>
    <CommentConversation v-if="comment.replies?.length" :comment="comment" />
    <div v-else class="mt-2 max-w-[72ch] text-sm leading-[1.65]">
      <SafeMarkdown :value="comment.body" />
    </div>
    <FixLine :item="comment" />
    <OpinionLine :opinion="comment.opinion" />
    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <span v-if="isCopied(comment)" class="text-[13px] text-muted">Copied to your review</span>
      <UButton v-else color="neutral" variant="ghost" @click="copyComment(comment)">
        Copy to my review
      </UButton>
    </div>
  </div>
</template>
