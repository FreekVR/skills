<script setup lang="ts">
// A button that opens a hunk in its first flow, or a generated hunk in the file dialog. Any other hunk in no flow is plain text.
const props = defineProps<{ hunk: { id: string, file: string } }>()

const at = computed(() => firstStationOf(props.hunk.id))
</script>

<template>
  <UButton v-if="at || isGenerated(hunk.id)" color="neutral" variant="ghost" class="-ml-2 text-left whitespace-normal text-toned" @click="openHunk(hunk.id)">
    <slot />{{ at ? `${stationCode(at.line, at.index)} ` : '' }}{{ hunk.file }}
  </UButton>
  <span v-else><slot />{{ hunk.file }}</span>
</template>
