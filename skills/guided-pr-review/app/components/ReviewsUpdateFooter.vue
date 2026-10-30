<script setup lang="ts">
// Below the reviewer's newest review: the call on each open comment becomes an update of that review. From updateFooter in panels.js.
const props = defineProps<{ footer: { form: boolean, left: number, open: number, verdicts: string[], intro: string, status: { status: string, text: string, url?: string } | null } }>()

const BUTTONS: Record<string, { label: string, color: 'error' | 'success' | 'neutral', variant: 'solid' | 'outline' | 'ghost', icon: string }> = {
  REQUEST_CHANGES: { label: 'Update review: request changes', color: 'error', variant: 'solid', icon: 'changes' },
  APPROVE: { label: 'Update review: approve', color: 'success', variant: 'solid', icon: 'approved' },
  COMMENT: { label: 'Update review: comment', color: 'neutral', variant: 'ghost', icon: 'comment' },
}

// With comments left open, approving is the weaker choice, so it gets the outline and says how many stay open.
const buttons = computed(() => props.footer.verdicts.map((verdict) => {
  const button = { verdict, ...BUTTONS[verdict]! }
  if (verdict === 'APPROVE' && props.footer.open) return { ...button, label: `${button.label} (${plural(props.footer.open, 'comment')} left open)`, variant: 'outline' as const }
  return button
}))
</script>

<template>
  <div class="mt-4.5 border-t border-default pt-3.5">
    <h3 class="m-0 mb-1 text-[15.5px] font-semibold">
      Update your review
    </h3>
    <template v-if="footer.form">
      <p class="mt-0 mb-6 max-w-[68ch] leading-[1.65] text-toned">
        {{ footer.intro }} GitHub shows the update as your newest review. It adds no new line comments: for those,
        <button type="button" class="cursor-pointer text-info underline underline-offset-3 focus-visible:rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info" @click="goTerminus()">post a new review</button>.
      </p>
      <UTextarea
        :model-value="state.reviewer.updateNote || ''"
        aria-label="Note to the author"
        placeholder="Note to the author. Optional for approve, needed for request changes and comment."
        autoresize
        :rows="3"
        class="w-full"
        @update:model-value="setUpdateNote"
      />
      <div class="mt-4.5 flex flex-wrap items-center gap-2.5">
        <UButton v-if="footer.left" color="neutral" variant="soft" disabled>
          Decide on {{ plural(footer.left, 'comment') }} first
        </UButton>
        <template v-else>
          <UButton
            v-for="button in buttons"
            :key="button.verdict"
            :color="button.color"
            :variant="button.variant"
            class="font-semibold"
            @click="postUpdate(button.verdict)"
          >
            <template #leading>
              <VerdictIcon :verdict="button.icon" class="size-[15px]" />
            </template>
            {{ button.label }}
          </UButton>
        </template>
      </div>
    </template>
    <TerminusPostResult v-if="footer.status" :result="footer.status" class="mt-4" />
  </div>
</template>
