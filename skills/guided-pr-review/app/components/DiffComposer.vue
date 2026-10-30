<script setup lang="ts">
// The form for a new remark on the lines in state.ui.composer. It takes the focus when it opens.
const props = defineProps<{ composer: { hunkId: string, startLine: number, startSide: string, line: number, side: string, text?: string, severity?: string } }>()

const key = computed(() => composerKey(props.composer))
const text = computed({
  get: () => state.ui.drafts[key.value] ?? props.composer.text ?? '',
  set: (value: string) => { state.ui.drafts[key.value] = value },
})
const severity = computed({
  get: () => composerSeverity(props.composer),
  set: (value: string) => { state.ui.composer.severity = value },
})
</script>

<template>
  <div class="relative border-y border-default bg-elevated px-5 pt-4 pb-[18px] font-sans whitespace-normal">
    <div class="flex flex-wrap items-baseline gap-2.5">
      <UAvatar :src="avatar(viewerLogin())" alt="" size="xs" class="-mr-0.5 self-center bg-elevated ring-1 ring-default" />
      <span class="text-xs text-muted">Your remark on {{ lineLabel(composer) }}</span>
    </div>
    <UTextarea v-model="text" aria-label="Remark text" placeholder="What should the author know or change?" :rows="3" autoresize autofocus class="mt-2 w-full" />
    <div class="mt-2 flex flex-wrap items-center gap-2">
      <label class="text-sm text-toned">Severity
        <select v-model="severity" class="ml-1 rounded-md border border-accented bg-default px-2 py-1 text-sm text-default">
          <option v-for="option in severities()" :key="option" :value="option">{{ option }}</option>
        </select>
      </label>
      <UButton color="neutral" class="bg-(--ui-text) text-(--ui-bg) hover:bg-(--ui-text-toned)" @click="addRemark(text, severity)">Add remark</UButton>
      <UButton color="neutral" variant="ghost" class="text-toned" @click="cancelRemark()">Cancel</UButton>
    </div>
  </div>
</template>
