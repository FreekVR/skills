<script setup lang="ts">
const open = computed({ get: () => Boolean(state.ui.shortcutsOpen), set: (value: boolean) => { state.ui.shortcutsOpen = value } })
</script>

<template>
  <UModal v-model:open="open" title="Keyboard shortcuts" :close="false" :ui="{ content: 'w-[min(380px,calc(100vw-32px))]', footer: 'justify-start' }">
    <template #body>
      <dl class="m-0 grid gap-2">
        <div v-for="shortcut in SHORTCUTS" :key="shortcut.key" class="grid grid-cols-[40px_1fr] items-center">
          <dt><UKbd :value="shortcut.key" class="lowercase" /></dt>
          <dd class="m-0 text-ui text-toned">{{ shortcut.label }}</dd>
        </div>
      </dl>
    </template>
    <template #footer="{ close }">
      <UButton color="neutral" variant="soft" @click="close()">Close</UButton>
    </template>
  </UModal>
</template>
