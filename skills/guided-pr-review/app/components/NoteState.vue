<script setup lang="ts">
// Whether a note goes into the review and where it stands on GitHub, as one icon whose label slides out on hover.
// `decision` is the decision on an AI finding; a remark has none. An open finding shows nothing: its buttons say it.
// `github` is the state of a comment that came from GitHub, which the page did not post: `posted` or `draft`.
const props = defineProps<{ id: string, body: string, decision?: string | null, github?: 'posted' | 'draft' }>()

const STATES: Record<string, { icon: string, label: string, tone: string }> = {
  dismissed: { icon: 'i-lucide-circle-slash', label: 'Not in your review', tone: 'bg-elevated text-muted' },
  local: { icon: 'i-lucide-cloud-off', label: 'In your review, not posted', tone: 'bg-elevated text-toned' },
  draft: { icon: 'i-lucide-file-pen-line', label: 'In GitHub draft', tone: 'bg-warning/15 text-warning' },
  posted: { icon: 'i-lucide-cloud-check', label: 'On GitHub', tone: 'bg-success/15 text-success' },
  changed: { icon: 'i-lucide-cloud-alert', label: 'Changed since posted', tone: 'bg-warning/15 text-warning' },
}

const shown = computed(() => {
  if (props.github) return { ...STATES[props.github], hint: '' }
  if (props.decision === 'open') return null
  const badge = statusBadge(props.id, props.body)
  // A dismissed finding that GitHub already has stays on GitHub, so its GitHub state wins.
  if (props.decision === 'dismissed' && badge.status === 'local') return { ...STATES.dismissed, hint: '' }
  return { ...STATES[badge.status], hint: badge.hint }
})
</script>

<template>
  <!-- It takes focus, so a keyboard user can open the label too; a screen reader always reads it. -->
  <span
    v-if="shown"
    role="img"
    tabindex="0"
    class="group ml-auto inline-flex items-center rounded-full p-1.5 text-tag leading-none font-semibold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
    :class="shown.tone"
    :title="shown.hint || undefined"
    :aria-label="[shown.label, shown.hint].filter(Boolean).join('. ')"
    data-note-state
  >
    <UIcon :name="shown.icon" class="size-4 shrink-0" aria-hidden="true" />
    <SlideLabel class="group-hover:mx-1 group-focus-visible:mx-1">{{ shown.label }}</SlideLabel>
  </span>
</template>
