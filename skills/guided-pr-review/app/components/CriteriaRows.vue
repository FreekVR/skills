<script setup lang="ts">
// One row per acceptance criterion: the agent's verdict, its note, and the flows that cover it.
// `framed` puts the rows in a bordered box, as in Submit review; on Home they sit in a panel without one.
defineProps<{ criteria: { id: string, text: string, verdict?: string, note?: string, source?: string }[], framed?: boolean }>()

const VERDICT_COLORS: Record<string, 'success' | 'error' | 'warning'> = { 'met': 'success', 'not-met': 'error', 'unclear': 'warning' }
</script>

<template>
  <ul role="list" class="m-0 list-none divide-y divide-default p-0" :class="framed ? 'rounded-lg border border-default' : 'mt-1'">
    <li v-for="criterion in criteria" :key="criterion.id" class="grid grid-cols-[112px_1fr] gap-x-4 gap-y-1.5 py-3.5 max-md:grid-cols-1" :class="framed && 'px-4.5'">
      <!-- One line of the criterion text high, so the badge sits centred on its first line. -->
      <span class="flex h-lh items-center self-start text-body">
        <UBadge
          :color="VERDICT_COLORS[criterion.verdict || ''] || 'neutral'"
          variant="solid"
          class="w-full justify-center rounded-md px-2 py-1.5 text-meta font-bold"
          :class="!VERDICT_COLORS[criterion.verdict || ''] && 'bg-(--ui-text-muted) text-inverted'"
        >
          {{ AC_VERDICTS[criterion.verdict || ''] || 'Not checked' }}
        </UBadge>
      </span>
      <span class="text-body">
        <span class="mr-2.5 font-mono text-label leading-none font-semibold"><MarkupText :text="criterion.id" /></span><MarkupText :text="criterion.text" />
        <span
          v-if="criterionSource(criterion)"
          class="ml-2 inline-block rounded-full border border-accented px-2 py-1 align-[2px] text-tag leading-none font-semibold whitespace-nowrap text-toned"
          :class="{ italic: criterionSource(criterion)?.kind === 'description' }"
          :title="criterionSource(criterion)?.title || undefined"
        >{{ criterionSource(criterion)?.label }}</span>
      </span>
      <span v-if="criterion.note" class="col-start-2 text-label text-toned max-md:col-start-1"><MarkupText :text="criterion.note" /></span>
      <span v-if="criterionFlows(criterion).length" class="col-start-2 flex flex-wrap max-md:col-start-1" :class="framed ? 'gap-2' : '-ml-1 gap-0.5'">
        <UButton
          v-for="line in criterionFlows(criterion)"
          :key="line.id"
          color="neutral"
          variant="ghost"
          :class="framed ? '-ml-2 gap-2 text-toned' : 'gap-1 p-1 font-normal text-default'"
          :title="line.name"
          @click="openFlow(line.id)"
        >
          <FlowBullet :line="line" mini />
          <FlowIcon :icon="line.icon" class="size-[1.05em]" :style="{ color: `var(--color-${line.color})` }" />
          <span>{{ line.name }}</span>
        </UButton>
      </span>
      <span v-else class="col-start-2 text-label text-toned max-md:col-start-1">No flow covers this criterion.</span>
    </li>
  </ul>
</template>
