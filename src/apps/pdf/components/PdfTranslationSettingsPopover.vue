<template>
  <div class="pdf-toolbar__language-popover">
    <div class="pdf-toolbar__language-popover-header">
      Translation Settings
    </div>
    <LanguageSelector
      :source-language="sourceLanguage"
      :target-language="targetLanguage"
      :provider="provider"
      :auto-detect-label="autoDetectLabel"
      :show-default-actions="false"
      :enable-select-element-integration="false"
      :disabled="disabled"
      @update:source-language="emit('update:sourceLanguage', $event)"
      @update:target-language="emit('update:targetLanguage', $event)"
    />
  </div>
</template>

<script setup>
import LanguageSelector from '@/components/shared/LanguageSelector.vue'

defineProps({
  sourceLanguage: { type: String, default: 'auto' },
  targetLanguage: { type: String, default: 'fa' },
  provider: { type: String, default: '' },
  autoDetectLabel: { type: String, default: 'Auto-Detect' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['update:sourceLanguage', 'update:targetLanguage'])
</script>
