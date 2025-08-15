<template>
  <div class="language-controls">
    <!-- Provider Selector -->
    <ProviderSelector
      mode="split"
      :disabled="disabled"
      @translate="handleTranslate"
      @provider-change="handleProviderChange"
    />

    <!-- Language Selector -->
    <LanguageSelector
      v-model:source-language="sourceLanguage"
      v-model:target-language="targetLanguage"
      :source-title="$i18n('popup_source_language_title') || 'زبان مبدا'"
      :target-title="$i18n('popup_target_language_title') || 'زبان مقصد'"
      :swap-title="$i18n('popup_swap_languages_title') || 'جابجایی زبان‌ها'"
      :swap-alt="$i18n('popup_swap_languages_alt_icon') || 'Swap'"
      :auto-detect-label="'Auto-Detect'"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupLanguageControls');

// Props
const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

// Stores
const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()

// State - using computed to sync with settings store
const sourceLanguage = computed({
  get: () => settingsStore.settings.SOURCE_LANGUAGE || AUTO_DETECT_VALUE,
  set: async (value) => {
    try {
      logger.info("[PopupLanguageControls] 🌍 Source language changed to:", value);
      await settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', value)
    } catch (error) {
      logger.error("[PopupLanguageControls] ❌ Failed to update source language:", error);
      await handleError(error, 'language-controls-source')
    }
  }
})

const targetLanguage = computed({
  get: () => settingsStore.settings.TARGET_LANGUAGE || 'English',
  set: async (value) => {
    try {
      logger.info("[PopupLanguageControls] 🌍 Target language changed to:", value);
      await settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', value)
    } catch (error) {
      logger.error("[PopupLanguageControls] ❌ Failed to update target language:", error);
      await handleError(error, 'language-controls-target')
    }
  }
})

// Methods


const handleTranslate = (data) => {
  logger.debug("[PopupLanguageControls] 🎯 Translate button clicked from ProviderSelector");
  // Emit to parent component
  const event = new CustomEvent('translate-request', { detail: data })
  document.dispatchEvent(event)
}

const handleProviderChange = (provider) => {
  logger.info("[PopupLanguageControls] 🔄 Provider changed to:", provider);
  // Emit to parent component
  const event = new CustomEvent('provider-changed', { detail: { provider } })
  document.dispatchEvent(event)
}

// No need for onMounted as LanguageSelector handles language loading
</script>

<style scoped>
.language-controls {
  display: flex;
  align-items: center;
  padding: 3px 12px;
  margin: 0;
  gap: 4px;
  background: var(--language-controls-bg-color);
  min-height: 36px;
  box-sizing: border-box;
}
</style>