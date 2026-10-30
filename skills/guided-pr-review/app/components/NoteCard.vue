<script setup lang="ts">
import { SEVERITY_CLASSES } from './DiffSeverity.vue'

// An AI finding or a remark of the reviewer, with the buttons to decide on it and to edit it in place.
interface NoteItem {
  id: string
  title?: string
  body: string
  severity: string
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
  set: (value: string) => { state.ui.drafts[`edit:${props.item.id}`] = value },
})
const editSeverity = ref(props.item.severity)
watch(editing, (open) => { if (open) editSeverity.value = props.item.severity })

function save() {
  if (isFinding.value) saveEdit(props.item.id, draft.value)
  else saveRemark(props.item.id, draft.value, editSeverity.value)
}

const struck = computed(() => decision.value === 'dismissed' && 'text-muted line-through decoration-1')
</script>

<template>
  <div
    class="relative border-y border-default px-5 pt-4 pb-4.5 font-sans whitespace-normal"
    :class="(decision === 'accepted' || !isFinding) && 'bg-[color-mix(in_srgb,var(--ui-success)_7%,var(--ui-bg))]'"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <template v-if="select">
        <span class="text-ui font-semibold" :class="struck"><MarkupText :text="item.title" /></span>
        <span class="relative inline-flex items-center">
          <select
            :value="select.current"
            class="cursor-pointer appearance-none rounded border py-1 pr-4.5 pl-1.5 font-mono text-meta leading-none font-semibold lowercase hover:border-(--ui-text)"
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
        <AiTag label="AI finding" />
        <span v-if="item.rule" class="text-meta whitespace-nowrap text-muted">{{ item.rule }}</span>
        <span v-if="decision === 'accepted'" class="text-meta font-semibold text-success">Accepted</span>
        <span v-else-if="decision === 'dismissed'" class="text-meta font-semibold text-muted">Dismissed</span>
        <StatusBadge v-if="decision === 'accepted'" :id="item.id" :body="text" />
      </template>
      <template v-else>
        <UAvatar :src="avatar(viewerLogin())" alt="" size="xs" class="-mr-0.5 self-center bg-elevated ring-1 ring-default" />
        <DiffSeverity :severity="item.severity" />
        <span class="text-meta text-muted">{{ own ? 'Your pending remark from GitHub' : 'Your remark' }}{{ item.line ? ` · ${lineLabel(item)}` : '' }}</span>
        <StatusBadge :id="item.id" :body="item.body" />
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
      <p class="mt-2 mb-0 max-w-[72ch] text-ui whitespace-pre-wrap" :class="struck"><MarkupText :text="text" /></p>
      <OpinionLine v-if="own?.body === item.body" :opinion="own.opinion" own />
      <div class="mt-2 flex flex-wrap items-center gap-1.5">
        <template v-if="isFinding">
          <UButton v-if="decision !== 'accepted'" color="success" variant="outline" @click="decideFinding(item.id, 'accepted')">Accept</UButton>
          <UButton v-if="decision !== 'dismissed'" color="neutral" variant="ghost" class="text-toned" @click="decideFinding(item.id, 'dismissed')">Dismiss</UButton>
          <UButton v-if="decision !== 'open'" color="neutral" variant="ghost" class="text-toned" @click="decideFinding(item.id, 'open')">Undo</UButton>
          <UButton color="neutral" variant="ghost" class="text-toned" @click="startEdit(item.id)">Edit text</UButton>
        </template>
        <template v-else>
          <UButton color="neutral" variant="ghost" class="text-toned" @click="startEdit(item.id)">Edit</UButton>
          <UButton color="error" variant="ghost" @click="deleteRemark(item.id)">Delete</UButton>
        </template>
      </div>
    </template>
  </div>
</template>
