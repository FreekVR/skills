<script setup lang="ts">
// The round button that opens the questions about a hunk. Opening the panel focuses its text field;
// closing it with Esc gives the focus back to the button.
const props = defineProps<{ hunk: { id: string, file: string } }>()

const open = computed({ get: () => Boolean(state.ui.askOpen), set: (value: boolean) => { state.ui.askOpen = value } })
const questions = computed(() => askQuestions(props.hunk) as { asked: { id: string, question: string }, answer: { answer: string } | null }[])
const waiting = computed(() => questions.value.some((question) => !question.answer))
const label = computed(() => (open.value ? 'Close the questions about this hunk' : 'Ask the agent about this hunk'))

const key = computed(() => `ask:${props.hunk.id}`)
const question = computed({
  get: () => state.ui.drafts[key.value] || '',
  set: (value: string) => { state.ui.drafts[key.value] = value },
})

// An answer turned into a remark continues in the remark form, which takes the focus; the panel closes and
// leaves the focus there instead of giving it back to the round button.
let focusStaysInForm = false
function turnIntoRemark(eventId: string) {
  focusStaysInForm = true
  open.value = false
  answerToRemark(eventId)
}

// The text field has autofocus, so the panel does not move the focus to its first button.
const content = {
  side: 'top' as const,
  align: 'end' as const,
  sideOffset: 14,
  onOpenAutoFocus: (event: Event) => event.preventDefault(),
  onCloseAutoFocus: (event: Event) => {
    if (focusStaysInForm) event.preventDefault()
    focusStaysInForm = false
  },
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="content"
    arrow
    :ui="{ content: 'w-[min(440px,calc(100vw-32px))] rounded-[14px] bg-[color-mix(in_srgb,var(--ui-bg)_85%,transparent)] ring-accented shadow-[0_18px_48px_rgba(0,0,0,.22),0_2px_8px_rgba(0,0,0,.08)] backdrop-blur-[14px]', arrow: 'fill-(--ui-bg) stroke-(--ui-border-accented)' }"
  >
    <button
      class="fixed right-6 bottom-6 z-5 grid size-14 cursor-pointer place-items-center rounded-full border-0 p-0 text-(--ui-bg) shadow-[0_8px_24px_rgba(0,0,0,.28)] hover:brightness-110"
      :class="open ? 'bg-(--ui-text-toned)' : 'bg-(--ui-text)'"
      :aria-label="label"
      :title="label"
    >
      <span v-if="waiting" class="absolute top-0.5 left-0.5 size-3 motion-safe:animate-pulse rounded-full border-2 border-(--ui-bg) bg-warning" aria-hidden="true" />
      <UIcon :name="open ? 'i-lucide-x' : 'i-lucide-message-square-text'" class="size-6.5 transition-transform duration-300" :class="open && 'rotate-90'" aria-hidden="true" />
      <span v-if="questions.length && !open" class="absolute -top-0.5 -right-0.5 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-(--ui-text) bg-default px-1.5 text-tag leading-none font-bold text-default">{{ questions.length }}</span>
    </button>

    <template #content>
      <section class="max-h-[min(60vh,560px)] overflow-y-auto px-4.5 pt-4 pb-4.5" aria-label="Ask the agent about this hunk">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h3 class="m-0 text-ui font-bold">Ask about {{ fileName(hunk.file) }}</h3>
        </div>
        <div v-for="{ asked, answer } in questions" :key="asked.id" class="mb-3.5 rounded-lg border border-default px-4 py-3.5">
          <p class="mt-0 mb-1 font-semibold">{{ asked.question }}</p>
          <template v-if="answer">
            <div class="leading-[1.6] text-toned [&>:first-child]:mt-0 [&>:last-child]:mb-0">
              <SafeMarkdown :value="answer.answer" />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <UButton color="neutral" variant="ghost" class="text-toned" @click="turnIntoRemark(asked.id)">Turn into a remark</UButton>
            </div>
          </template>
          <span v-else class="inline-flex items-center gap-2 text-label text-muted">
            <span class="size-2 motion-safe:animate-pulse rounded-full bg-warning" aria-hidden="true" />Waiting for the agent…
          </span>
        </div>
        <UTextarea v-model="question" aria-label="Question about this hunk" placeholder="For example: why is the cache keyed by city?" :rows="3" autoresize autofocus class="w-full" />
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <UButton color="neutral" class="bg-(--ui-text) text-(--ui-bg) hover:bg-(--ui-text-toned)" @click="askAgent(hunk.id, question)">Ask</UButton>
        </div>
      </section>
    </template>
  </UPopover>
</template>
