<template>
  <div class="advanced-features">
    <h3 class="section-title">Advanced Features</h3>
    
    <div class="features-grid">
      <BaseButton
        variant="outline"
        size="sm"
        icon="camera"
        text="Screen Capture"
        :disabled="!canTranslate"
        @click="$emit('screen-capture')"
      />
      
      <BaseButton
        variant="outline"
        size="sm"
        icon="volume"
        text="Text to Speech"
        :disabled="!canTranslate"
        @click="$emit('tts-toggle')"
      />
    </div>
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

defineEmits(['screen-capture', 'tts-toggle'])
</script>

<style scoped>
.advanced-features {
  padding: 16px;
  border-top: 1px solid var(--color-border);
}

.section-title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0 0 12px 0;
}

.features-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>