<script setup lang="ts">
// One row per acceptance criterion: the agent's verdict, its note, and the flows that cover it.
// `framed` puts the rows in a bordered box, as in Submit review; on Home they sit in a panel without one.
defineProps<{ criteria: { id: string, text: string, verdict?: string, note?: string, source?: string }[], framed?: boolean }>()

const VERDICT_COLORS: Record<string, 'success' | 'error' | 'warning'> = { 'met': 'success', 'not-met': 'error', 'unclear': 'warning' }
</script>

<template>
  <ul role="list" class="m-0 list-none divide-y divide-default p-0" :class="framed ? 'rounded-lg border border-default' : 'mt-1'">
    <li v-for="criterion in criteria" :key="criterion.id" class="grid grid-cols-[112px_1fr] gap-x-4 gap-y-1.5 py-3.5 max-sm:grid-cols-1" :class="framed && 'px-[18px]'">
      <UBadge
        :color="VERDICT_COLORS[criterion.verdict || ''] || 'neutral'"
        variant="solid"
        class="justify-center self-start rounded-md px-2 py-[5px] text-xs leading-[1.2] font-bold"
        :class="!VERDICT_COLORS[criterion.verdict || ''] && 'bg-(--ui-text-muted) text-inverted'"
      >
        {{ AC_VERDICTS[criterion.verdict || ''] || 'Not checked' }}
      </UBadge>
      <span class="text-[14.5px] leading-[1.55]">
        <span class="mr-2.5 font-mono text-[13px] leading-none font-semibold"><MarkupText :text="criterion.id" /></span><MarkupText :text="criterion.text" />
        <span
          v-if="criterionSource(criterion)"
          class="ml-2 inline-block rounded-full border border-accented px-[7px] py-[3px] align-[2px] text-[11px] leading-none font-semibold whitespace-nowrap text-toned"
          :class="{ italic: criterionSource(criterion)?.kind === 'description' }"
          :title="criterionSource(criterion)?.title || undefined"
        >{{ criterionSource(criterion)?.label }}</span>
      </span>
      <span v-if="criterion.note" class="col-start-2 text-[13px] leading-[1.55] text-toned max-sm:col-start-1"><MarkupText :text="criterion.note" /></span>
      <span v-if="criterionFlows(criterion).length" class="col-start-2 flex flex-wrap max-sm:col-start-1" :class="framed ? 'gap-2' : '-ml-1 gap-0.5'">
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
          <UIcon v-if="/^[a-z0-9-]+$/.test(line.icon || '')" :name="`i-lucide-${line.icon}`" class="size-[1.05em]" :style="{ color: `var(--color-${line.color})` }" aria-hidden="true" />
          <span>{{ line.name }}</span>
        </UButton>
      </span>
      <span v-else class="col-start-2 text-[13px] leading-[1.55] text-toned max-sm:col-start-1">No flow covers this criterion.</span>
    </li>
  </ul>
</template>
