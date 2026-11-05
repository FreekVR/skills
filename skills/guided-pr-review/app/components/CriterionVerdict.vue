<script setup lang="ts">
// The agent's verdict on an acceptance criterion, as a round pill. Only the icon carries the verdict colour,
// so the pill stays readable on a band of any colour.
const props = defineProps<{ criterion: { verdict: string, pr?: number } }>()

const LOOKS: Record<string, { icon: string, color: string }> = {
  'met': { icon: 'i-lucide-check', color: 'text-success' },
  'not-met': { icon: 'i-lucide-x', color: 'text-error' },
  'unclear': { icon: 'i-lucide-circle-question-mark', color: 'text-warning' },
  'elsewhere': { icon: 'i-lucide-git-pull-request', color: 'text-info' },
}
const look = computed(() => LOOKS[props.criterion.verdict] || LOOKS.unclear)
</script>

<template>
  <span class="inline-block rounded-full bg-elevated px-2 py-1 align-[2px] font-sans text-tag leading-none font-semibold whitespace-nowrap text-default" data-criterion-verdict>
    <UIcon :name="look.icon" class="mr-1 size-3 align-[-1px]" :class="look.color" aria-hidden="true" data-verdict-icon />
    {{ criterionVerdictLabel(props.criterion) }}
  </span>
</template>
