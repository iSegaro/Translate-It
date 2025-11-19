<template>
  <section class="api-tab">
    <h2>{{ t('api_section_title') || 'Translation API' }}</h2>
    
    <div class="setting-group">
      <label>{{ t('translation_api_label') || 'API Choice' }}</label>
      <ProviderSelector v-model="selectedProvider" />
    </div>
    
    <div class="provider-settings">
      <div
        v-if="selectedProvider === 'google'"
        class="api-info"
      >
        <h3>{{ t('google_translate_settings_title') || 'Google Translate' }}</h3>
        <p class="setting-description">
          {{ t('google_translate_description') || 'Uses the free, public Google Translate endpoint. No API key is required.' }}
        </p>
      </div>
      
      <div
        v-else-if="selectedProvider === 'bing'"
        class="api-info"
      >
        <h3>{{ t('bing_translate_settings_title') || 'Microsoft Bing Translate' }}</h3>
        <p class="setting-description">
          {{ t('bing_translate_description') || 'Uses the free, public Microsoft Bing Translate endpoint. No API key is required.' }}
        </p>
      </div>

      <component :is="providerSettingsComponent" />
    </div>
  </section>
</template>

<script setup>
import { ref, watch, computed, defineAsyncComponent } from 'vue'
  import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import ProviderSelector from '@/components/feature/ProviderSelector.vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ApiTab')

const settingsStore = useSettingsStore()

// Selected provider
const selectedProvider = ref(settingsStore.settings?.TRANSLATION_API || 'google')

// Dynamically load the settings component based on the selected provider
const providerSettingsComponent = computed(() => {
  const provider = selectedProvider.value;
  switch (provider) {
    case 'gemini':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/GeminiApiSettings.vue'));
    case 'yandex':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/YandexApiSettings.vue'));
    case 'browser':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/BrowserApiSettings.vue'));
    case 'webai':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/WebAIApiSettings.vue'));
    case 'openai':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/OpenAIApiSettings.vue'));
    case 'openrouter':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/OpenRouterApiSettings.vue'));
    case 'deepseek':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/DeepseekApiSettings.vue'));
    case 'zai':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/ZaiApiSettings.vue'));
    case 'custom':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/CustomApiSettings.vue'));
    default:
      return null;
  }
});

// Watch for changes in selectedProvider and update the store locally
watch(selectedProvider, (newValue, oldValue) => {
  logger.debug('🔧 API provider changed:', oldValue, '→', newValue)
  settingsStore.updateSettingLocally('TRANSLATION_API', newValue)
})
  const { t } = useI18n()
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;
@use "@/assets/styles/components/api-settings-common" as *;

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