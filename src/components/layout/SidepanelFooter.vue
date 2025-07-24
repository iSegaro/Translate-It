<template>
  <footer class="sidepanel-footer">
    <BaseButton
      variant="ghost"
      size="sm"
      icon="settings"
      text="Settings"
      full-width
      @click="$emit('open-options')"
    />
  </footer>
</template>

<script setup>
import BaseButton from '@/components/base/BaseButton.vue'

defineEmits(['open-options'])
</script>

<style scoped>
.sidepanel-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  background-color: var(--color-surface);
  flex-shrink: 0;
}
</style>