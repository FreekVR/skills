<script setup lang="ts">
import { NOTE_BLOCK, SEVERITY_CLASSES, SEVERITY_EDGES } from './DiffSeverity.vue'

// An AI finding or a remark of the reviewer, with the buttons to decide on it and to edit it in place.
interface NoteItem {
  id: string
  title?: string
  body: string
  severity: string
  severitySource?: string
  stack?: { verdict: string, pr?: number, prs?: number[], note?: string }
  rule?: string
  line?: number
  startLine?: number
  side?: string
  startSide?: string
}
const props = defineProps<{ type: 'finding' | 'remark', item: NoteItem }>()

const isFinding = computed(() => props.type === 'finding')
const decision = computed(() => (isFinding.value ? decisionOf(props.item) : null))
const text = computed(() => (isFinding.value ? findingText(props.item) : props.item.body))
const select = computed(() => (isFinding.value ? severitySelect(props.item) : null))
const selectClasses = computed(() => (select.value ? SEVERITY_CLASSES[severityLevel(select.value.current)] : ''))
// The chevron lies on top of the select, so it takes the text colour of the select's level.
const chevronColor = computed(() => selectClasses.value.split(' ').filter((name) => name.startsWith('text-')))
const own = computed(() => (isFinding.value ? null : ownRemark(props.item.id)))
const editing = computed(() => state.ui.editing === props.item.id)

// The edit form keeps its text in state.ui.drafts, so a redraw does not lose it.
const draft = computed({
  get: () => state.ui.drafts[`edit:${props.item.id}`] ?? text.value,
  set: (value: string) => setDraft(`edit:${props.item.id}`, value),
})
const editSeverity = ref(props.item.severity)
watch(editing, (open) => { if (open) editSeverity.value = props.item.severity })

function save() {
  if (isFinding.value) saveEdit(props.item.id, draft.value)
  else saveRemark(props.item.id, draft.value, editSeverity.value)
}

const struck = computed(() => decision.value === 'dismissed' && 'text-muted line-through decoration-1')

// The edge of the note carries its severity; a dismissed finding loses it.
const edge = computed(() => (decision.value === 'dismissed' ? 'border-r-accented' : SEVERITY_EDGES[severityLevel(select.value?.current ?? props.item.severity)]))
</script>

<template>
  <div :class="[NOTE_BLOCK, edge]">
    <div class="flex flex-wrap items-center gap-2.5">
      <template v-if="select">
        <AiTag label="AI finding" />
        <span class="font-display text-lead" :class="struck"><MarkupText :text="item.title" /></span>
        <span class="relative inline-flex items-center">
          <select
            :value="select.current"
            class="cursor-pointer appearance-none rounded border py-1 pr-4.5 pl-1.5 font-mono text-meta leading-none font-bold lowercase hover:opacity-85"
            :class="selectClasses"
            :aria-label="select.title"
            :title="select.title"
            @change="setFindingSeverity(item.id, ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in severities()" :key="option" :value="option">{{ option }}</option>
          </select>
          <UIcon name="i-lucide-chevron-down" class="pointer-events-none absolute right-1 size-3" :class="chevronColor" aria-hidden="true" />
        </span>
        <span v-if="select.changed" class="text-meta text-muted">AI said {{ select.suggested }}</span>
        <span v-if="item.rule" class="text-meta whitespace-nowrap text-muted">{{ item.rule }}</span>
      </template>
      <template v-else>
        <UAvatar :src="avatar(viewerLogin())" alt="" size="xs" class="-mr-0.5 self-center bg-elevated ring-1 ring-default" />
        <DiffSeverity :severity="item.severity" />
        <span v-if="item.severitySource === 'ai'" class="text-meta text-muted"><AiTag label="" class="mr-1.5" />AI set the severity</span>
        <span class="text-meta text-muted">{{ own ? 'Your pending remark from GitHub' : 'Your remark' }}{{ item.line ? ` · ${lineLabel(item)}` : '' }}</span>
      </template>
    </div>
    <div v-if="editing">
      <UTextarea v-model="draft" :aria-label="isFinding ? 'Edit the finding text' : 'Edit your remark'" :rows="3" autoresize autofocus class="mt-2 w-full" />
      <div class="mt-2 flex flex-wrap items-center gap-2">
        <label v-if="!isFinding" class="text-ui text-toned">Severity
          <select v-model="editSeverity" class="ml-1 rounded-md border border-accented bg-default px-2 py-1 text-ui text-default">
            <option v-for="option in severities()" :key="option" :value="option">{{ option }}</option>
          </select>
        </label>
        <UButton color="neutral" class="bg-(--ui-text) text-(--ui-bg) hover:bg-(--ui-text-toned)" @click="save()">{{ isFinding ? 'Save text' : 'Save remark' }}</UButton>
        <UButton color="neutral" variant="ghost" class="text-toned" @click="cancelEdit(item.id)">Cancel</UButton>
      </div>
    </div>
    <template v-else>
      <!-- Remarks and findings are posted as markdown, and a remark can quote a comment from GitHub. -->
      <div class="mt-2 max-w-[72ch] text-ui [&>:first-child]:mt-0 [&>:last-child]:mb-0" :class="struck">
        <SafeMarkdown :value="text" />
      </div>
      <StackLine v-if="isFinding" :finding="item" />
      <OpinionLine v-if="own?.body === item.body" :opinion="own.opinion" own />
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <template v-if="isFinding">
          <UButton v-if="decision !== 'accepted'" color="success" variant="solid" class="font-bold" @click="decideFinding(item.id, 'accepted')">Accept</UButton>
          <UButton v-if="decision !== 'dismissed'" color="neutral" variant="ghost" class="text-toned" @click="decideFinding(item.id, 'dismissed')">Dismiss</UButton>
          <UButton v-if="decision !== 'open'" color="neutral" variant="ghost" class="text-toned" @click="decideFinding(item.id, 'open')">Undo</UButton>
          <UButton color="neutral" variant="ghost" class="text-toned" @click="startEdit(item.id)">Edit text</UButton>
        </template>
        <template v-else>
          <UButton color="neutral" variant="ghost" class="text-toned" @click="startEdit(item.id)">Edit</UButton>
          <UButton color="error" variant="ghost" @click="deleteRemark(item.id)">Delete</UButton>
        </template>
        <NoteState :id="item.id" :body="text" :decision="decision" />
      </div>
    </template>
  </div>
</template>
