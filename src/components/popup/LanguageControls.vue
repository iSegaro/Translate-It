<template>
  <div class="language-controls">
    <LanguageSelector
      v-model="targetLanguage"
      @update:modelValue="handleTargetLanguageChange"
      :title="$i18n('popup_target_language_title') || 'زبان مقصد'"
    />
    
    <button
      @click="handleSwapLanguages"
      class="swap-button"
      :title="$i18n('popup_swap_languages_title') || 'جابجایی زبان‌ها'"
      :disabled="!canSwap"
    >
      <IconButton
        icon="swap.png"
        :alt="$i18n('popup_swap_languages_alt_icon') || 'Swap'"
        type="inline"
      />
    </button>

    <LanguageSelector
      v-model="sourceLanguage"
      @update:modelValue="handleSourceLanguageChange"
      :title="$i18n('popup_source_language_title') || 'زبان مبدا'"
      :show-auto-detect="true"
    />
    
    <ProviderSelector 
      mode="split"
      @translate="handleTranslate"
      @provider-change="handleProviderChange"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import IconButton from '@/components/shared/IconButton.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'

// Stores
const settingsStore = useSettingsStore()

// State
const sourceLanguage = ref('auto')
const targetLanguage = ref('English')

// Computed
const canSwap = computed(() => {
  return sourceLanguage.value !== 'auto' && 
         sourceLanguage.value !== targetLanguage.value
})

// Watch for settings changes
watch(() => settingsStore.settings.SOURCE_LANGUAGE, (newValue) => {
  sourceLanguage.value = newValue || 'auto'
}, { immediate: true })

watch(() => settingsStore.settings.TARGET_LANGUAGE, (newValue) => {
  targetLanguage.value = newValue || 'English'
}, { immediate: true })

// Methods
const handleSourceLanguageChange = async () => {
  try {
    await settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', sourceLanguage.value)
  } catch (error) {
    console.error('Error updating source language:', error)
  }
}

const handleTargetLanguageChange = async () => {
  try {
    await settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', targetLanguage.value)
  } catch (error) {
    console.error('Error updating target language:', error)
  }
}

const handleSwapLanguages = async () => {
  if (!canSwap.value) return
  
  try {
    const tempSource = sourceLanguage.value
    const tempTarget = targetLanguage.value
    
    sourceLanguage.value = tempTarget
    targetLanguage.value = tempSource
    
    await Promise.all([
      settingsStore.updateSettingAndPersist('SOURCE_LANGUAGE', sourceLanguage.value),
      settingsStore.updateSettingAndPersist('TARGET_LANGUAGE', targetLanguage.value)
    ])
    
    // Emit event to notify other components
    const event = new CustomEvent('languages-swapped', {
      detail: {
        source: sourceLanguage.value,
        target: targetLanguage.value
      }
    })
    document.dispatchEvent(event)
  } catch (error) {
    console.error('Error swapping languages:', error)
    // Revert on error
    sourceLanguage.value = settingsStore.settings.SOURCE_LANGUAGE
    targetLanguage.value = settingsStore.settings.TARGET_LANGUAGE
  }
}

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

.language-select {
  flex: 1;
  min-width: 100px;
  padding: 7px 8px;
  font-size: 14px;
  border: 1px solid var(--language-select-border-color);
  border-radius: 4px;
  background-color: var(--language-select-bg-color);
  color: var(--language-select-text-color);
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url('data:image/svg+xml;charset=US-ASCII,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="5" viewBox="0 0 10 5"><path fill="%236c757d" d="M0 0l5 5 5-5z"/></svg>');
  background-repeat: no-repeat;
  background-position: left 8px center;
  background-size: 10px 5px;
  padding-left: 25px;
  filter: var(--icon-filter);
}

.swap-button {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.2s ease, filter 0.2s ease-in-out;
  flex-shrink: 0;
}

.swap-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.swap-button img {
  width: 16px;
  height: 16px;
  opacity: var(--icon-opacity);
  filter: var(--icon-filter);
  transition: opacity 0.2s ease-in-out;
}

.swap-button:hover img {
  opacity: var(--icon-hover-opacity);
}

.swap-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.swap-button:disabled:hover {
  background-color: transparent;
}
</style>