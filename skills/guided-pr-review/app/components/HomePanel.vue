<script setup lang="ts">
// A status panel of Home in the colour of its tone: ok, warn, bad, info or quiet. `icon` is a status icon name from panels.js.
defineProps<{ id?: string, tone: string, icon: string, title?: string }>()

// The tone lives in the icon disc and the pills; the panel itself is one quiet field.
const PANEL_TONES: Record<string, string> = {
  ok: 'bg-elevated',
  warn: 'bg-[color-mix(in_srgb,var(--ui-warning)_9%,var(--ui-bg-elevated))]',
  bad: 'bg-[color-mix(in_srgb,var(--ui-error)_9%,var(--ui-bg-elevated))]',
  info: 'bg-elevated',
  quiet: 'bg-elevated',
}
</script>

<template>
  <section :id="id" class="scroll-mt-6 rounded-card px-5 pt-4 pb-4.5" :class="PANEL_TONES[tone]">
    <header v-if="title" class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <HomeStatusIcon :tone="tone" :icon="icon" />
      <h4 class="m-0 font-display text-lead text-default">
        {{ title }}
      </h4>
      <slot name="tag" />
      <span v-if="$slots.pills" class="ml-auto flex flex-wrap gap-1.5">
        <slot name="pills" />
      </span>
    </header>
    <div v-if="$slots.default" :class="title ? 'mt-2.5 ml-12 max-md:ml-0' : ''">
      <slot />
    </div>
  </section>
</template>
