<script setup lang="ts">
import { highlightLines } from './DiffCode.vue'
import type { CodeToken } from './DiffCode.vue'

// The whole file of a hunk, from state.ui.wholeFile, with every change of the file marked. It opens at the first changed line.
// With a `list` of hunk IDs, as for the generated files, it shows the diff of the hunk instead, and walks the list.
interface FileRow { kind: string, number: number | null, text: string }

const body = useTemplateRef<HTMLElement>('body')
const file = computed(() => state.ui.wholeFile as { hunkId: string, file: string, rows?: FileRow[], focusLine?: number, list?: string[] } | null)
const at = computed(() => (file.value?.list ? file.value.list.indexOf(file.value.hunkId) : -1))
const hunk = computed(() => (file.value ? hunkById(file.value.hunkId) : null))
// A generated file, opened from the group, names why it counts as generated and the flow stops it is also in.
const groupFile = computed(() => (file.value?.list ? generatedFiles().find((candidate: { hunkId: string }) => candidate.hunkId === file.value!.hunkId) : null))
const open = computed({ get: () => Boolean(file.value), set: (value: boolean) => { if (!value) state.ui.wholeFile = null } })
const SIGNS: Record<string, string> = { add: '+', del: '−', ctx: ' ' }

// The file is coloured as one text; removed lines, which are not in it, as a text of their own.
const tokens = ref<(CodeToken[] | null)[] | null>(null)
watch(file, async (current) => {
  tokens.value = null
  if (!current?.rows) return
  const kept = current.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind !== 'del')
  const removed = current.rows.map((row, index) => ({ row, index })).filter(({ row }) => row.kind === 'del')
  const [keptLines, removedLines] = await Promise.all([highlightLines(kept.map(({ row }) => row.text), current.file), highlightLines(removed.map(({ row }) => row.text), current.file)])
  if (file.value !== current || !keptLines || !removedLines) return
  const result: (CodeToken[] | null)[] = current.rows.map(() => null)
  kept.forEach(({ index }, at) => { result[index] = keptLines[at] || null })
  removed.forEach(({ index }, at) => { result[index] = removedLines[at] || null })
  tokens.value = result
}, { immediate: true })

// The stop is on another page, so the dialog closes first.
function openStop(lineId: string, index: number) {
  state.ui.wholeFile = null
  go(lineId, index)
}

function scrollToFocus() {
  body.value?.querySelector(`tr[data-line="${file.value?.focusLine}"]`)?.scrollIntoView({ block: 'center' })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="file?.file"
    :description="file?.list ? 'The diff of the file, with its findings and remarks.' : 'The whole file at the head of the pull request, with the changes marked.'"
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
    <template #title>
      <span v-if="file?.list" class="inline-flex items-center gap-2">
        <FlowBullet :line="GENERATED_LINE" class="size-5! text-tag!"><UIcon name="i-lucide-cog" class="relative size-[1.2em]" /></FlowBullet>
        <span>{{ file.file }}</span>
      </span>
      <template v-else>{{ file?.file }}</template>
    </template>
    <template #actions>
      <!-- On a phone the tools take their own row under the title, so the close button stays on the title row. -->
      <span v-if="file?.list" class="flex flex-wrap items-center gap-2 max-md:order-1 max-md:basis-full">
        <span v-if="groupFile" class="rounded-full bg-accented px-2 py-1 text-meta leading-none font-semibold whitespace-nowrap text-toned">{{ reasonLabel(groupFile) }}</span>
        <UButton
          v-for="{ line, index } in groupFile?.shared || []"
          :key="line.id"
          color="neutral"
          variant="soft"
          size="sm"
          class="font-normal text-default"
          @click="openStop(line.id, index)"
        >
          Open {{ stationCode(line, index) }} in {{ line.name }}
        </UButton>
        <span class="inline-flex items-center gap-1 text-label text-toned">
          <UButton color="neutral" variant="ghost" size="sm" square icon="i-lucide-chevron-left" aria-label="Previous file" :disabled="at <= 0" @click="openGeneratedFile(file.list[at - 1])" />
          <span class="whitespace-nowrap tabular-nums">{{ at + 1 }} of {{ file.list.length }}</span>
          <UButton color="neutral" variant="ghost" size="sm" square icon="i-lucide-chevron-right" aria-label="Next file" :disabled="at >= file.list.length - 1" @click="openGeneratedFile(file.list[at + 1])" />
        </span>
      </span>
      <StationFileTools v-else-if="hunk" :hunk="hunk" class="max-md:order-1 max-md:basis-full" />
    </template>
    <template #body>
      <div v-if="file?.list && hunk" class="p-4">
        <DiffView :hunk="hunk" no-whole-file class="mt-0!" />
      </div>
      <div v-else ref="body" class="station-diff" tabindex="0">
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
