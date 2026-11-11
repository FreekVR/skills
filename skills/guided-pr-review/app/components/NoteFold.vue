<script setup lang="ts">
// The head line of a comment, finding or remark with a button that folds its body away. The head stays in view,
// with the `folded` slot under it while folded. reviewer.json keeps the choice.
defineProps<{ id: string, folded: boolean }>()
</script>

<template>
  <div class="flex items-start gap-2">
    <div class="min-w-0 flex-1">
      <slot name="head" />
    </div>
    <UButton
      color="neutral"
      variant="ghost"
      size="xs"
      square
      icon="i-lucide-chevron-up"
      :aria-label="folded ? 'Expand comment' : 'Collapse comment'"
      :aria-expanded="!folded"
      :title="folded ? 'Expand' : 'Collapse'"
      class="-my-1 -mr-2 shrink-0 text-muted"
      :ui="{ leadingIcon: `transition-transform duration-200 ease-[cubic-bezier(.34,1.56,.64,1)] ${folded ? 'rotate-180' : ''}` }"
      data-fold-button
      @click="setCollapsed(id, !folded)"
    />
  </div>
  <div v-if="folded && $slots.folded" class="mt-1.5">
    <slot name="folded" />
  </div>
  <!-- The body stays in the page while folded, so its height can animate; it turns invisible when the animation ends. Reduced motion stops the animation in main.css. -->
  <div
    class="grid transition-[grid-template-rows,opacity,visibility] transition-discrete duration-200 ease-(--ease-review)"
    :class="folded ? 'invisible grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'"
    :data-folded="folded ? '' : undefined"
  >
    <div class="min-h-0 overflow-y-clip">
      <slot />
    </div>
  </div>
</template>
