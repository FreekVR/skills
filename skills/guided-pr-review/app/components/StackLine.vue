<script setup lang="ts">
// What the agent found in the other PRs of the stack for a finding, from stackLine(). Every finding in a stack has one,
// so the reviewer can tell "checked, nothing there" from "not checked".
const props = defineProps<{ finding: { stack?: { verdict: string, pr?: number, prs?: number[], note?: string } } }>()

const LOOKS: Record<string, { icon: string, color: string }> = {
  'fixed': { icon: 'i-lucide-check', color: 'text-success' },
  'worse': { icon: 'i-lucide-triangle-alert', color: 'text-error' },
  'untouched': { icon: 'i-lucide-layers', color: 'text-muted' },
  'not-checked': { icon: 'i-lucide-circle-dashed', color: 'text-warning' },
}
const line = computed(() => stackLine(props.finding))
const look = computed(() => (line.value ? LOOKS[line.value.verdict] || LOOKS['not-checked'] : null))
// A PR that fixes or worsens the finding links to its review on this computer, when it has one.
const other = computed(() => {
  const pr = props.finding.stack?.pr
  return pr ? stackRows().find((row) => row.number === pr && row.action === 'open') || null : null
})
</script>

<template>
  <p v-if="line && look" class="mt-2.5 mb-0 flex max-w-[76ch] items-start gap-2.5 text-ui text-toned" data-stack-line>
    <UIcon :name="look.icon" class="mt-0.5 size-4 shrink-0" :class="look.color" aria-hidden="true" />
    <span><AiTag label="" class="mr-1.5" /><b class="font-semibold text-default">In the stack:</b> <MarkupText :text="line.text" /><template v-if="other"> <a :href="other.page" class="text-info underline underline-offset-3">Open the review of #{{ other.number }}</a></template></span>
  </p>
</template>
