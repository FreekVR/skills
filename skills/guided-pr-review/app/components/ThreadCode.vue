<script setup lang="ts">
// GitHub's diff hunk ends at the commented line, so its last lines show the code the comment is about.
const props = defineProps<{ comment: { diffHunk?: string, side?: string } }>()

const SIGNS: Record<string, string> = { add: '+', del: '−', ctx: ' ' }
const ROW_COLORS: Record<string, string> = { add: 'bg-add-bg text-add-ink', del: 'bg-del-bg text-del-ink' }

const rows = computed(() => {
  if (!props.comment.diffHunk) return []
  const [header, ...lines] = props.comment.diffHunk.split('\n')
  const [, oldStart, newStart] = header!.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/) as RegExpMatchArray
  return diffRows({ lines, oldStart: Number(oldStart), newStart: Number(newStart) })
    .filter((row: { kind: string }) => row.kind !== 'meta')
    .slice(-4)
    .map((row: { kind: string, oldNo?: number, newNo?: number, text: string }) => ({
      ...row,
      number: (row.kind === 'del' || (row.kind === 'ctx' && props.comment.side === 'LEFT') ? row.oldNo : row.newNo) || '',
    }))
})
</script>

<template>
  <div v-if="rows.length" class="my-2 overflow-x-auto rounded-md border border-default">
    <table class="w-full border-collapse font-mono text-[12.5px] leading-[1.7] tabular-nums" aria-label="The commented line is the last one">
      <tbody>
        <tr v-for="(row, index) in rows" :key="index" :class="ROW_COLORS[row.kind]">
          <td
            class="w-[1%] min-w-12 border-r border-default px-2 text-right align-top whitespace-pre select-none"
            :class="index === rows.length - 1 ? 'font-semibold text-default shadow-[inset_3px_0_0_var(--ui-info)]' : 'text-dimmed'"
          >
            {{ row.number }}
          </td>
          <td class="w-[1%] py-0 pr-0 pl-2 align-top whitespace-pre select-none" :class="row.kind === 'ctx' && 'text-dimmed'">{{ SIGNS[row.kind] }}</td>
          <td class="px-2.5 align-top whitespace-pre">{{ row.text || ' ' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
