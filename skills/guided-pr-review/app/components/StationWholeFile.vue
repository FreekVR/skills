<script setup lang="ts">
import { highlightLines } from './DiffCode.vue'
import type { CodeToken } from './DiffCode.vue'

// The whole file of a hunk, from state.ui.wholeFile, with every change of the file marked. It opens at the first changed line.
interface FileRow { kind: string, number: number | null, text: string }

const body = useTemplateRef<HTMLElement>('body')
const file = computed(() => state.ui.wholeFile as { hunkId: string, file: string, rows: FileRow[], focusLine: number } | null)
const hunk = computed(() => (file.value ? hunkById(file.value.hunkId) : null))
const open = computed({ get: () => Boolean(file.value), set: (value: boolean) => { if (!value) state.ui.wholeFile = null } })
const SIGNS: Record<string, string> = { add: '+', del: '−', ctx: ' ' }

// The file is coloured as one text; removed lines, which are not in it, as a text of their own.
const tokens = ref<(CodeToken[] | null)[] | null>(null)
watch(file, async (current) => {
  tokens.value = null
  if (!current) return
  const kept = current.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== 'del')
  const removed = current.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === 'del')
  const [keptLines, removedLines] = await Promise.all([highlightLines(kept.map(({ row }) => row.text), current.file), highlightLines(removed.map(({ row }) => row.text), current.file)])
  if (file.value !== current || !keptLines || !removedLines) return
  const result: (CodeToken[] | null)[] = current.rows.map(() => null)
  kept.forEach(({ index }, at) => { result[index] = keptLines[at] || null })
  removed.forEach(({ index }, at) => { result[index] = removedLines[at] || null })
  tokens.value = result
}, { immediate: true })

function scrollToFocus() {
  body.value?.querySelector(`tr[data-line="${file.value?.focusLine}"]`)?.scrollIntoView({ block: 'center' })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="file?.file"
    description="The whole file at the head of the pull request, with the changes marked."
    :close="{ title: 'Close (Esc)' }"
    :ui="{
      content: 'w-[min(1200px,calc(100vw-32px))] max-w-none h-[min(860px,calc(100dvh-32px))] rounded-xl ring-accented shadow-[0_16px_48px_rgba(0,0,0,.35)]',
      header: 'flex-wrap gap-x-3 gap-y-2 bg-elevated py-3 pr-3.5 pl-4.5 min-h-0',
      wrapper: 'min-w-0 flex-auto',
      title: 'font-mono text-ui font-semibold wrap-anywhere',
      description: 'sr-only',
      close: 'static',
      body: 'p-0 sm:p-0 overflow-auto overscroll-contain',
    }"
    @after:enter="scrollToFocus"
  >
    <template #actions>
      <StationFileTools v-if="hunk" :hunk="hunk" class="max-md:order-1 max-md:basis-full" />
    </template>
    <template #body>
      <div ref="body" class="station-diff" tabindex="0">
        <table class="w-full border-collapse font-mono text-label leading-[1.7] tabular-nums">
          <tbody>
            <tr v-for="(row, index) in file?.rows || []" :key="index" :class="[row.kind, row.number === file?.focusLine && 'focus']" :data-line="row.number || undefined">
              <td class="num">{{ row.number || '' }}</td>
              <td class="sign">{{ SIGNS[row.kind] }}</td>
              <td class="code"><DiffCode :text="row.text" :tokens="tokens?.[index]" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </UModal>
</template>
