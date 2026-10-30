<script setup lang="ts">
// An AI finding on the whole PR. It folds to one line, so long findings do not push the flows down.
type Finding = { id: string, title: string, body: string, severity: string, rule?: string }
const props = defineProps<{ finding: Finding }>()

// The four severity levels, from quiet to loud.
const SEVERITY_VARIANTS = ['outline', 'outline', 'soft', 'solid'] as const

const key = computed(() => `finding:${props.finding.id}`)
const decision = computed(() => decisionOf(props.finding))

function toggle(event: Event) {
  if ((event.target as HTMLDetailsElement).open) state.ui.openExplain.add(key.value)
  else state.ui.openExplain.delete(key.value)
}
</script>

<template>
  <li class="border-t border-default first:border-t-0">
    <details class="group" :open="state.ui.openExplain.has(key)" @toggle="toggle">
      <summary class="flex cursor-pointer list-none items-baseline gap-2.5 py-2.5 text-[14.5px] font-semibold [&::-webkit-details-marker]:hidden">
        <UBadge color="neutral" :variant="SEVERITY_VARIANTS[severityLevel(finding.severity)]" size="sm" class="shrink-0 font-mono lowercase">
          {{ finding.severity }}
        </UBadge>
        <span class="min-w-0"><MarkupText :text="finding.title" /></span>
        <span v-if="decision !== 'open'" class="text-xs font-semibold" :class="decision === 'accepted' ? 'text-success' : 'text-dimmed'">{{ decision === 'accepted' ? 'Accepted' : 'Dismissed' }}</span>
        <UIcon name="i-lucide-chevron-down" class="ml-auto size-4 shrink-0 self-center transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <NoteCard type="finding" :item="finding" class="mb-3.5" />
    </details>
  </li>
</template>
