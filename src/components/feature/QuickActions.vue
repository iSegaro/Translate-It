<template>
  <div class="quick-actions">
    <BaseButton
      variant="outline"
      size="sm"
      icon="translate"
      text="Quick Translate"
      :disabled="!canTranslate"
      @click="$emit('quick-translate')"
    />
    
    <BaseButton
      variant="ghost"
      size="sm"
      icon="settings"
      text="Options"
      @click="$emit('open-options')"
    />
    
    <BaseButton
      variant="ghost"
      size="sm"
      icon="panel"
      text="Sidepanel"
      @click="$emit('open-sidepanel')"
    />
  </div>
</template>

<script setup>
import BaseButton from '@/components/base/BaseButton.vue'

defineProps({
  canTranslate: {
    type: Boolean,
    required: true
  }
})

defineEmits(['quick-translate', 'open-options', 'open-sidepanel'])
</script>

<style scoped>
.quick-actions {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-top: 1px solid var(--color-border);
}
</style>