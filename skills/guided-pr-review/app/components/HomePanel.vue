<script setup lang="ts">
// A status panel of Home in the colour of its tone: ok, warn, bad, info or quiet. `icon` is a status icon name from panels.js.
defineProps<{ id?: string, tone: string, icon: string, title?: string }>()

const PANEL_TONES: Record<string, string> = {
  ok: 'border-success/30 bg-success/5',
  warn: 'border-warning/30 bg-warning/5',
  bad: 'border-error/30 bg-error/5',
  info: 'border-info/30 bg-info/5',
  quiet: 'border-default bg-transparent',
}
</script>

<template>
  <section :id="id" class="scroll-mt-6 rounded-xl border px-4.5 pt-3.5 pb-4" :class="PANEL_TONES[tone]">
    <header v-if="title" class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <HomeStatusIcon :tone="tone" :icon="icon" />
      <h4 class="m-0 text-lead font-bold tracking-[-.005em] text-default">
        {{ title }}
      </h4>
      <slot name="tag" />
      <span v-if="$slots.pills" class="ml-auto flex flex-wrap gap-1.5">
        <slot name="pills" />
      </span>
    </header>
    <div v-if="$slots.default" :class="title ? 'mt-2.5 ml-11 max-md:ml-0' : ''">
      <slot />
    </div>
  </section>
</template>
