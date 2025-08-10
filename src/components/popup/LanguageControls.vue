<template>
  <div class="language-controls">
    <!-- Unified Language Selector with swap functionality -->
    <LanguageSelector
      v-model:source-language="sourceLanguage"
      v-model:target-language="targetLanguage"
      :source-title="$i18n('popup_source_language_title') || 'زبان مبدا'"
      :target-title="$i18n('popup_target_language_title') || 'زبان مقصد'"
      :swap-title="$i18n('popup_swap_languages_title') || 'جابجایی زبان‌ها'"
      :swap-alt="$i18n('popup_swap_languages_alt_icon') || 'Swap'"
      :auto-detect-label="'Auto-Detect'"
    />
    
    <ProviderSelector 
      mode="split"
      @translate="handleTranslate"
      @provider-change="handleProviderChange"
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

// Stores
const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()

// State - using computed to sync with settings store
const sourceLanguage = computed({
  get: () => settingsStore.settings.SOURCE_LANGUAGE || AUTO_DETECT_VALUE,
  set: async (value) => {
    try {
      await settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', value)
    } catch (error) {
      await handleError(error, 'language-controls-source')
    }
  }
})

const targetLanguage = computed({
  get: () => settingsStore.settings.TARGET_LANGUAGE || 'English',
  set: async (value) => {
    try {
      await settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', value)
    } catch (error) {
      await handleError(error, 'language-controls-target')
    }
  }
})

// Methods


const handleTranslate = (data) => {
  // Emit to parent component
  const event = new CustomEvent('translate-request', { detail: data })
  document.dispatchEvent(event)
}

const handleProviderChange = (provider) => {
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
  padding: 6px 12px;
  gap: 6px;
  background: var(--language-controls-bg-color);
  border-bottom: 1px solid var(--language-controls-border-color);
}
</style>