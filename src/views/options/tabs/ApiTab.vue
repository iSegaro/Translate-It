<template>
  <section class="api-tab">
    <h2>{{ $i18n('api_section_title') || 'Translation API' }}</h2>
    
    <div class="setting-group">
      <label>{{ $i18n('translation_api_label') || 'API Choice' }}</label>
      <ProviderSelector v-model="selectedProvider" />
    </div>
    
    <div class="provider-settings">
      <div v-if="selectedProvider === 'google'" class="api-info">
        <h3>{{ $i18n('google_translate_settings_title') || 'Google Translate' }}</h3>
        <p class="setting-description">
          {{ $i18n('google_translate_description') || 'Uses the free, public Google Translate endpoint. No API key is required.' }}
        </p>
      </div>
      
      <div v-else-if="selectedProvider === 'bing'" class="api-info">
        <h3>{{ $i18n('bing_translate_settings_title') || 'Microsoft Bing Translate' }}</h3>
        <p class="setting-description">
          {{ $i18n('bing_translate_description') || 'Uses the free, public Microsoft Bing Translate endpoint. No API key is required.' }}
        </p>
      </div>
      
      <GeminiApiSettings v-else-if="selectedProvider === 'gemini'" />
      <YandexApiSettings v-else-if="selectedProvider === 'yandex'" />
      <BrowserApiSettings v-else-if="selectedProvider === 'browser'" />
      <WebAIApiSettings v-else-if="selectedProvider === 'webai'" />
      <OpenAIApiSettings v-else-if="selectedProvider === 'openai'" />
      <OpenRouterApiSettings v-else-if="selectedProvider === 'openrouter'" />
      <DeepseekApiSettings v-else-if="selectedProvider === 'deepseek'" />
      <CustomApiSettings v-else-if="selectedProvider === 'custom'" />
    </div>
  </section>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import ProviderSelector from '@/components/feature/ProviderSelector.vue'
import GeminiApiSettings from '@/components/feature/api-settings/GeminiApiSettings.vue'
import YandexApiSettings from '@/components/feature/api-settings/YandexApiSettings.vue'
import BrowserApiSettings from '@/components/feature/api-settings/BrowserApiSettings.vue'
import WebAIApiSettings from '@/components/feature/api-settings/WebAIApiSettings.vue'
import OpenAIApiSettings from '@/components/feature/api-settings/OpenAIApiSettings.vue'
import OpenRouterApiSettings from '@/components/feature/api-settings/OpenRouterApiSettings.vue'
import DeepseekApiSettings from '@/components/feature/api-settings/DeepseekApiSettings.vue'
import CustomApiSettings from '@/components/feature/api-settings/CustomApiSettings.vue'

const settingsStore = useSettingsStore()

// Selected provider
const selectedProvider = ref(settingsStore.settings?.TRANSLATION_API || 'google')

// Watch for changes in selectedProvider and update the store locally
watch(selectedProvider, (newValue) => {
  settingsStore.updateSettingLocally('TRANSLATION_API', newValue)
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;
@use '@/assets/styles/_api-settings-common.scss' as *;

.api-tab {
  max-width: 800px;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.provider-settings {
  margin-top: $spacing-xl;
}
</style>