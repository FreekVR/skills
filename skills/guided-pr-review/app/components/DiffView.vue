<script setup lang="ts">
import { highlightRows } from './DiffCode.vue'
import type { CodeToken } from './DiffCode.vue'

// The diff of one hunk: its head with the file tools, the notes without a line, and the rows with their notes.
// A press on a line number starts a selection of lines; with shift it extends the open remark form.
const props = defineProps<{ hunk: { id: string, file: string, lines: string[] } }>()

interface Row { kind: string, text: string, oldNo?: number, newNo?: number, gap?: boolean }
const diff = computed(() => hunkDiff(props.hunk))
const rows = computed<Row[]>(() => diff.value.rows)

// The colours load after the rows; until then the rows show plain text.
const tokens = ref<(CodeToken[] | null)[] | null>(null)
watch(() => `${props.hunk.file}\n${props.hunk.lines.join('\n')}`, async (key) => {
  tokens.value = null
  const result = await highlightRows(rows.value, props.hunk.file)
  if (key === `${props.hunk.file}\n${props.hunk.lines.join('\n')}`) tokens.value = result
}, { immediate: true })

const SIGNS: Record<string, string> = { add: '+', del: '−', ctx: ' ' }

function location(row: Row) { return rowLocation(row) as { side: string, line: number } }

// The rows of a drag in progress, or of the open remark form.
const selecting = computed(() => {
  const drag = state.ui.drag
  if (!drag || drag.hunkId !== props.hunk.id) return null
  return [Math.min(drag.anchor, drag.current), Math.max(drag.anchor, drag.current)]
})

function rowClass(row: Row, index: number) {
  const selected = diff.value.selected
  return [
    row.kind,
    selected && index >= selected[0] && index <= selected[1] && 'selected',
    selecting.value && index >= selecting.value[0] && index <= selecting.value[1] && 'selecting',
    diff.value.marks.get(index),
  ]
}

function onPointerDown(event: PointerEvent, index: number) {
  if (event.button !== 0) return
  event.preventDefault()
  startRowDrag(props.hunk.id, index, event.shiftKey)
}

// A click without a pointer press (detail 0) comes from the keyboard.
function onClick(event: MouseEvent, index: number) {
  if (event.detail === 0) remarkOnRow(props.hunk.id, index)
}

useEventListener(document, 'pointermove', (event: PointerEvent) => {
  const drag = state.ui.drag
  if (!drag || drag.hunkId !== props.hunk.id) return
  const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(`tr[data-hunk-row="${drag.hunkId}"]`)
  if (row) moveRowDrag(Number(row.dataset.row))
})
useEventListener(document, 'pointerup', () => {
  if (state.ui.drag?.hunkId === props.hunk.id) endRowDrag()
})
</script>

<template>
  <section class="mt-7 overflow-hidden rounded-lg border border-default" aria-label="Diff">
    <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-b border-default bg-elevated px-3 py-2 font-mono text-label text-muted">
      <span class="min-w-0 flex-auto wrap-anywhere">{{ hunk.file }}</span>
      <StationFileTools :hunk="hunk" whole />
      <span v-if="rows.length" class="whitespace-nowrap" :title="diff.ranges">
        <span class="font-semibold text-success" aria-hidden="true">+{{ diff.added }}</span>
        <span class="font-semibold text-error" aria-hidden="true">−{{ diff.removed }}</span>
        <span class="sr-only">{{ diff.ranges }}</span>
      </span>
    </div>

    <p v-if="diff.empty" class="m-0 px-3 py-3.5 text-ui text-toned">{{ diff.empty }}</p>
    <DiffNote v-for="note in diff.loose" :key="`${note.type}:${note.item.id}`" :note="note" />

    <div v-if="!diff.empty" class="station-diff overflow-x-auto [container-type:inline-size]" tabindex="0" role="region" :aria-label="`Diff of ${hunk.file}`">
      <table class="w-full border-collapse font-mono text-label leading-[1.7] tabular-nums">
        <tbody>
          <template v-for="(row, index) in rows" :key="index">
            <tr v-if="row.kind === 'meta'">
              <td class="num" /><td class="num" /><td class="sign" /><td class="code meta">{{ row.text }}</td>
            </tr>
            <template v-else>
              <tr :class="rowClass(row, index)" :data-hunk-row="hunk.id" :data-row="index">
                <td v-for="side in ['LEFT', 'RIGHT']" :key="side" class="num">
                  <template v-if="side === 'LEFT' ? row.oldNo : row.newNo">
                    <button
                      v-if="location(row).side === side"
                      :aria-label="`Write a remark on line ${location(row).line}`"
                      @pointerdown="onPointerDown($event, index)"
                      @click="onClick($event, index)"
                    >{{ location(row).line }}</button>
                    <template v-else>{{ side === 'LEFT' ? row.oldNo : row.newNo }}</template>
                  </template>
                </td>
                <td class="sign">
                  <button
                    class="add-line"
                    :aria-label="`Add a remark on line ${location(row).line}`"
                    @pointerdown="onPointerDown($event, index)"
                    @click="onClick($event, index)"
                  >
                    <UIcon name="i-lucide-plus" aria-hidden="true" />
                  </button>{{ SIGNS[row.kind] }}
                </td>
                <td class="code"><DiffCode :text="row.text" :tokens="tokens?.[index]" /></td>
              </tr>
              <tr v-for="note in diff.rowNotes[index]" :key="`${note.type}:${note.item.id}`" class="note">
                <td colspan="4"><DiffNote :note="note" class="sticky left-0 w-[100cqw]" /></td>
              </tr>
              <tr v-if="index === diff.composerRow" class="note">
                <td colspan="4"><DiffComposer :key="composerKey(diff.composer)" :composer="diff.composer" class="sticky left-0 w-[100cqw]" /></td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style>
/* The table rules of the single-file page. They are global, so the whole-file dialog uses them too. */
.station-diff td { padding: 0 10px; vertical-align: top; white-space: pre; }
.station-diff td.num { width: 1%; min-width: 48px; padding: 0 8px; text-align: right; color: var(--ui-text-muted); user-select: none; border-right: 1px solid var(--ui-border); }
.station-diff td.num button { all: unset; touch-action: pan-y; cursor: pointer; display: block; width: 100%; text-align: right; }
.station-diff td.num button:hover, .station-diff td.num button:focus-visible { color: var(--ui-info); text-decoration: underline; }
.station-diff td.num button:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.station-diff td.sign { position: relative; width: 1%; padding: 0 0 0 8px; user-select: none; color: var(--ui-text-muted); }
.station-diff td.meta { color: var(--ui-text-muted); }
.station-diff tr.add { background: var(--color-add-bg); }
.station-diff tr.add td:is(.sign, .code) { color: var(--color-add-ink); }
.station-diff tr.del { background: var(--color-del-bg); }
.station-diff tr.del td:is(.sign, .code) { color: var(--color-del-ink); }
.station-diff tr.noted td.num { box-shadow: inset 3px 0 0 var(--ui-text-muted); }
.station-diff tr.noted-mine td { background-image: linear-gradient(color-mix(in srgb, var(--ui-text) 11%, transparent), color-mix(in srgb, var(--ui-text) 11%, transparent)); }
.station-diff tr.noted-mine td.num { box-shadow: inset 4px 0 0 var(--ui-text); }
.station-diff tr:is(.selected, .selecting) td { background: color-mix(in srgb, var(--ui-info) 14%, transparent); }
.station-diff tr:is(.selected, .selecting) td.num { box-shadow: inset 3px 0 0 var(--ui-info); }
.station-diff tr.focus td.num { box-shadow: inset 3px 0 0 var(--ui-info); }
.station-diff .add-line { touch-action: pan-y; position: absolute; left: -4px; top: 50%; z-index: 1; display: grid; place-items: center; width: 22px; height: 22px; margin-top: -11px; padding: 0; border: 0; border-radius: 6px; background: var(--ui-info); color: var(--ui-bg); cursor: pointer; opacity: 0; transform: scale(.85); transition: opacity .12s cubic-bezier(.33, 1, .68, 1), transform .12s cubic-bezier(.33, 1, .68, 1); }
.station-diff .add-line svg { width: 12px; height: 12px; }
.station-diff tr:hover .add-line, .station-diff .add-line:focus-visible { opacity: 1; transform: none; }
.station-diff tr.note td { padding: 0; white-space: normal; background: var(--ui-bg); font-family: var(--font-sans); }
</style>
