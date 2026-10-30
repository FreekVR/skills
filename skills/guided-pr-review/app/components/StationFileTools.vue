<script setup lang="ts">
// Open the file of a hunk: the whole file in a dialog, in an editor, or in its folder. The editors and the folder need
// the local clone, which the agent names in pr.localPath.
const props = defineProps<{ hunk: { id: string, file: string, status?: string, binary?: boolean }, whole?: boolean }>()

const ICONS: Record<string, string> = { vscode: 'i-lucide-code', phpstorm: 'i-lucide-code', folder: 'i-lucide-folder' }
const tools = computed(() => editorTools(props.hunk) as { kind: string, label: string, title: string, url?: string, file?: string }[])
const showWhole = computed(() => props.whole && fileKept(props.hunk))
const buttonClass = 'font-sans text-meta font-normal text-toned hover:text-default'
</script>

<template>
  <span v-if="showWhole || tools.length" class="flex flex-wrap gap-1">
    <UButton v-if="showWhole" color="neutral" variant="outline" size="xs" icon="i-lucide-file-text" :class="buttonClass" title="Show the whole file with the changes marked" @click="showWholeFile(hunk)">Whole file</UButton>
    <template v-for="tool in tools" :key="tool.kind">
      <UButton v-if="tool.url" :to="tool.url" external color="neutral" variant="outline" size="xs" :icon="ICONS[tool.kind]" :class="buttonClass" :title="tool.title">{{ tool.label }}</UButton>
      <UButton v-else color="neutral" variant="outline" size="xs" :icon="ICONS[tool.kind]" :class="buttonClass" :title="tool.title" @click="showInFolder(tool.file)">{{ tool.label }}</UButton>
    </template>
  </span>
</template>
