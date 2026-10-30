<script setup lang="ts">
// A button that opens a hunk in its first flow. A hunk in no flow is plain text.
const props = defineProps<{ hunk: { id: string, file: string } }>()

const at = computed(() => firstStationOf(props.hunk.id))
</script>

<template>
  <UButton v-if="at" color="neutral" variant="ghost" class="-ml-2 text-left whitespace-normal text-toned" @click="go(at.line.id, at.index)">
    <slot />{{ stationCode(at.line, at.index) }} {{ hunk.file }}
  </UButton>
  <span v-else><slot />{{ hunk.file }}</span>
</template>
