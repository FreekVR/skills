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
const ICON_TONES: Record<string, string> = {
  ok: 'text-success bg-success/15 ring-success/10',
  warn: 'text-warning bg-warning/15 ring-warning/10',
  bad: 'text-error bg-error/15 ring-error/10',
  info: 'text-info bg-info/15 ring-info/10',
  quiet: 'text-muted bg-elevated ring-(--ui-bg-elevated)/50',
}
</script>

<template>
  <UIcon v-if="bare" :name="ICONS[icon] || ICONS.none" class="size-[15px]" aria-hidden="true" />
  <span v-else class="grid shrink-0 place-items-center rounded-full ring-4" :class="[ICON_TONES[tone], small ? 'size-7' : 'size-[34px]']" aria-hidden="true">
    <UIcon :name="ICONS[icon] || ICONS.none" :class="small ? 'size-4' : 'size-[18px]'" />
  </span>
</template>
