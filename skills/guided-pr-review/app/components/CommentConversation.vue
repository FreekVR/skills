<script setup lang="ts">
// A comment and its replies. A line from avatar to avatar joins the replies to the comment they answer.
// An avatar that does not load is hidden with its line, so no empty circle stays in front of the text.
const props = defineProps<{ comment: { author?: string, body: string, replies?: { author: string, body: string, at?: string }[] } }>()

const entries = computed(() => conversation(props.comment) as { author: string, body: string, at?: string }[])
</script>

<template>
  <ol role="list" class="mt-2.5 mb-0 grid list-none gap-4 p-0">
    <li
      v-for="(entry, index) in entries"
      :key="index"
      class="relative flex items-start gap-2.5 has-[[data-slot=fallback]]:before:hidden"
      :class="index < entries.length - 1 && 'before:absolute before:top-7 before:-bottom-3.5 before:left-[11px] before:border-l-2 before:border-accented'"
    >
      <UAvatar :src="avatar(entry.author)" alt="" size="xs" loading="lazy" class="shrink-0 bg-elevated ring-1 ring-default has-[[data-slot=fallback]]:hidden" />
      <div class="min-w-0 flex-1" :class="index && 'rounded-lg bg-[color-mix(in_srgb,var(--line,var(--ui-text-muted))_6%,transparent)] px-3 py-2'">
        <span class="text-meta text-muted"><b>@{{ entry.author }}</b>{{ index ? ' replied' : '' }}<template v-if="entry.at"> · {{ timeLabel(entry.at) }}</template></span>
        <div class="text-body [&>:first-child]:mt-1 [&>:last-child]:mb-0">
          <SafeMarkdown :value="entry.body" />
        </div>
      </div>
    </li>
  </ol>
</template>
