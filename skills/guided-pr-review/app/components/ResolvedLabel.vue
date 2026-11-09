<script setup lang="ts">
// Says that a comment is resolved on GitHub, and by whom; the page shows resolved comments too, with this label.
defineProps<{ comment: { resolved?: boolean, resolvedBy?: string } }>()
</script>

<template>
  <b v-if="comment.resolved" class="font-semibold text-default">{{ comment.resolvedBy ? `Resolved by @${comment.resolvedBy}` : 'Resolved' }}</b>
</template>
