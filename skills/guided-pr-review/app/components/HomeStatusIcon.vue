<script setup lang="ts">
// The round icon of a status panel. `icon` is a status icon name from panels.js, or 'comment'.
// `bare` draws only the icon, for a pill.
defineProps<{ tone: string, icon: string, small?: boolean, bare?: boolean }>()

const ICONS: Record<string, string> = {
  ok: 'i-lucide-circle-check',
  bad: 'i-lucide-circle-x',
  warn: 'i-lucide-triangle-alert',
  finding: 'i-lucide-circle-alert',
  none: 'i-lucide-circle-minus',
  coverage: 'i-lucide-flask-conical',
  notRead: 'i-lucide-eye-off',
  progress: 'i-lucide-map-pin',
  link: 'i-lucide-link',
  comment: 'i-lucide-message-square',
}
// A filled disc: the tone is the fill, the icon is white on it.
const ICON_TONES: Record<string, string> = {
  ok: 'bg-success text-inverted',
  warn: 'bg-warning text-inverted',
  bad: 'bg-error text-inverted',
  info: 'bg-info text-inverted',
  quiet: 'bg-(--ui-text-muted) text-inverted',
}
</script>

<template>
  <UIcon v-if="bare" :name="ICONS[icon] || ICONS.none" class="size-4" aria-hidden="true" />
  <span v-else class="grid shrink-0 place-items-center rounded-full" :class="[ICON_TONES[tone], small ? 'size-7' : 'size-9']" aria-hidden="true">
    <UIcon :name="ICONS[icon] || ICONS.none" :class="small ? 'size-4' : 'size-5'" />
  </span>
</template>
