<template>
  <section class="languages-tab">
    <h2>{{ t('languages_section_title') || 'Languages' }}</h2>

    <div
      v-if="!isLoaded"
      class="loading-message"
    >
      Loading languages...
    </div>
    <template v-else>
      <div class="setting-group">
        <label>{{ t('source_language_label') || 'Source Language' }}</label>
        <LanguageDropdown
          v-model="sourceLanguage"
          :languages="filteredSourceLanguages"
          type="source"
        />
      </div>

      <div class="setting-group">
        <label>{{ t('target_language_label') || 'Target Language' }}</label>
        <LanguageDropdown
          v-model="targetLanguage"
          :languages="filteredTargetLanguages"
          type="target"
        />
      </div>
    </template>

    <!-- Validation errors -->
    <div
      v-if="validationErrorKey"
      class="validation-error"
    >
      {{ t(validationErrorKey) }}
    </div>

    <!-- Separator for API Settings section -->
    <div class="section-separator" />

    <!-- API Settings Section -->
    <div class="api-settings-section">
      <h3>{{ t('api_section_title') || 'Translation API' }}</h3>

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
    </div>
  </section>
</template>

<script setup>
import { ref, onMounted, watch, computed, defineAsyncComponent } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useValidation } from '@/core/validation.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import ProviderSelector from '@/components/feature/ProviderSelector.vue'
import { useI18n } from 'vue-i18n'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PROVIDER_SUPPORTED_LANGUAGES, getCanonicalCode } from '@/shared/config/languageConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguagesTab')

const settingsStore = useSettingsStore()
const { validateLanguages: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()
const { allLanguages, loadLanguages, isLoaded } = useLanguages()

const { t } = useI18n()

// Form values as refs
const sourceLanguage = ref(settingsStore.settings?.SOURCE_LANGUAGE || 'auto')
const targetLanguage = ref(settingsStore.settings?.TARGET_LANGUAGE || 'English')

// ========== Provider-Specific Language Filtering ==========
/**
 * Filter languages based on the selected provider
 * Handles DeepL beta languages toggle automatically
 * Uses canonical code matching for providers with different code formats
 */
const filteredSourceLanguages = computed(() => {
  const provider = settingsStore.selectedProvider
  const languages = allLanguages.value || []

  // Auto-detect is always included for source
  const autoOption = { code: 'auto', name: 'Auto-Detect', promptName: 'Auto Detect' }

  // If languages not loaded yet, return auto only
  if (!languages.length) {
    return [autoOption]
  }

  // AI providers support all languages
  if (['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(provider)) {
    return [autoOption, ...languages]
  }

  // DeepL with beta toggle
  if (provider === 'deepl') {
    const betaEnabled = settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true
    const supportedCodes = betaEnabled
      ? PROVIDER_SUPPORTED_LANGUAGES.deepl_beta
      : PROVIDER_SUPPORTED_LANGUAGES.deepl

    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => getCanonicalCode(code))
    )

    const filtered = languages.filter(lang => {
      if (lang.code === 'auto') return true
      return normalizedSupportedCodes.has(getCanonicalCode(lang.code))
    })

    return [autoOption, ...filtered]
  }

  // Other providers with specific language support
  const supportedCodes = PROVIDER_SUPPORTED_LANGUAGES[provider]
  if (supportedCodes && supportedCodes.length > 0) {
    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => getCanonicalCode(code))
    )

    const filtered = languages.filter(lang => {
      if (lang.code === 'auto') return true
      return normalizedSupportedCodes.has(getCanonicalCode(lang.code))
    })

    return [autoOption, ...filtered]
  }

  // Fallback: return all languages
  return [autoOption, ...languages]
})

const filteredTargetLanguages = computed(() => {
  const provider = settingsStore.selectedProvider
  const languages = allLanguages.value || []

  // If languages not loaded yet, return empty
  if (!languages.length) {
    return []
  }

  // AI providers support all languages
  if (['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(provider)) {
    return languages
  }

  // DeepL with beta toggle
  if (provider === 'deepl') {
    const betaEnabled = settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true
    const supportedCodes = betaEnabled
      ? PROVIDER_SUPPORTED_LANGUAGES.deepl_beta
      : PROVIDER_SUPPORTED_LANGUAGES.deepl

    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => getCanonicalCode(code))
    )

    return languages.filter(lang => {
      return normalizedSupportedCodes.has(getCanonicalCode(lang.code))
    })
  }

  // Other providers with specific language support
  const supportedCodes = PROVIDER_SUPPORTED_LANGUAGES[provider]
  if (supportedCodes && supportedCodes.length > 0) {
    const normalizedSupportedCodes = new Set(
      supportedCodes.map(code => getCanonicalCode(code))
    )

    return languages.filter(lang => {
      return normalizedSupportedCodes.has(getCanonicalCode(lang.code))
    })
  }

  // Fallback: return all languages
  return languages
})

// Watch for provider changes and validate selected languages
watch(() => settingsStore.selectedProvider, (newProvider) => {
  // Check if current source language is supported by new provider
  const sourceSupported = filteredSourceLanguages.value.some(l => l.code === sourceLanguage.value)
  if (!sourceSupported) {
    // Fallback to auto or first available language
    sourceLanguage.value = 'auto'
    logger.debug(`Source language not supported by ${newProvider}, reset to auto`)
  }

  // Check if current target language is supported by new provider
  const targetSupported = filteredTargetLanguages.value.some(l => l.code === targetLanguage.value)
  if (!targetSupported) {
    // Fallback to English or first available language (try different code variations)
    const english = filteredTargetLanguages.value.find(l =>
      l.code === 'en' || l.code === 'English' || getCanonicalCode(l.code) === 'en'
    )
    targetLanguage.value = english?.code || filteredTargetLanguages.value[0]?.code || 'English'
    logger.debug(`Target language not supported by ${newProvider}, reset to`, targetLanguage.value)
  }
})

// Watch for DeepL beta toggle changes
watch(() => settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED, (newBeta, oldBeta) => {
  if (settingsStore.selectedProvider === 'deepl' && newBeta !== oldBeta) {
    // Re-validate languages when beta toggle changes
    const sourceSupported = filteredSourceLanguages.value.some(l => l.code === sourceLanguage.value)
    if (!sourceSupported) {
      sourceLanguage.value = 'auto'
      logger.debug('Source language not supported with new beta setting, reset to auto')
    }

    const targetSupported = filteredTargetLanguages.value.some(l => l.code === targetLanguage.value)
    if (!targetSupported) {
      const english = filteredTargetLanguages.value.find(l =>
        l.code === 'en' || l.code === 'English' || getCanonicalCode(l.code) === 'en'
      )
      targetLanguage.value = english?.code || filteredTargetLanguages.value[0]?.code || 'English'
      logger.debug('Target language not supported with new beta setting, reset to', targetLanguage.value)
    }
  }
})

// Sync with settings on mount
onMounted(async () => {
  await loadLanguages();
  sourceLanguage.value = settingsStore.settings?.SOURCE_LANGUAGE || 'auto'
  targetLanguage.value = settingsStore.settings?.TARGET_LANGUAGE || 'English'
  // Validate on mount to show error if languages are the same
  await validateLanguages()
})

// Update settings when changed
watch(sourceLanguage, (value) => {
  settingsStore.updateSettingLocally('SOURCE_LANGUAGE', value)
  validateLanguages()
})
watch(targetLanguage, (value) => {
  settingsStore.updateSettingLocally('TARGET_LANGUAGE', value)
  validateLanguages()
})

// ========== API Settings ==========
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
    case 'deepl':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/DeepLApiSettings.vue'));
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

// Validation
const validationErrorKey = ref('')

const validateLanguages = async () => {
  clearErrors()
  const isValid = await validate(sourceLanguage.value, targetLanguage.value)

  if (!isValid) {
    // Get the error key directly for reactive translation
    const sourceError = getFirstError('sourceLanguage')
    const targetError = getFirstError('targetLanguage')
    validationErrorKey.value = sourceError || targetError || ''
  } else {
    validationErrorKey.value = ''
  }

  return isValid
}

// Only validate languages in this tab
defineExpose({
  validate: validateLanguages
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.languages-tab {
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

// Separator between sections
.section-separator {
  border-top: 2px solid var(--color-border);
  margin: $spacing-xl 0;
}

// API Settings Section
.api-settings-section {
  margin-top: $spacing-xl;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    margin: 0 0 $spacing-base 0;
    padding-bottom: $spacing-base;
    border-bottom: $border-width $border-style var(--color-border);
    color: var(--color-text);
  }

  .provider-settings {
    margin-top: $spacing-lg;
  }

  .api-info {
    padding: $spacing-md;
    background-color: var(--color-background);
    border-radius: $border-radius-base;
    margin-bottom: $spacing-lg;

    h3 {
      font-size: $font-size-base;
      font-weight: $font-weight-medium;
      margin: 0 0 $spacing-sm 0;
      padding: 0;
      border: none;
      color: var(--color-text);
    }

    .setting-description {
      font-size: $font-size-sm;
      color: var(--color-text-secondary);
      margin: 0;
    }
  }

  // Make all API settings inputs align with language dropdowns
  // Language dropdowns are flex: 0 0 250px, so we limit API inputs similarly
  :deep(.api-key-section) .ti-textarea,
  :deep(.setting-group) .ti-select,
  :deep(.setting-group) .ti-input,
  :deep(.setting-group) .ti-provider-select {
    max-width: var(--input-max-width, 620px);
  }
}

.setting-group {
  margin-bottom: $spacing-lg;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: 0;
    flex: 1;
    white-space: nowrap;
  }
  
  .language-dropdown {
    flex: 0 0 250px;
  }
}

.font-settings {
  flex-direction: column;
  align-items: stretch;
  border-top: 2px solid var(--color-border);
  margin-top: $spacing-xl;
  padding-top: $spacing-lg;
  
  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    margin: 0 0 $spacing-base 0;
    color: var(--color-text);
  }
}

.validation-error {
  background-color: var(--color-error);
  color: white;
  padding: $spacing-base;
  border-radius: $border-radius-base;
  margin-top: $spacing-base;
  font-size: $font-size-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    label {
      min-width: auto;
    }
    
    .language-dropdown {
      min-width: auto;
      width: 100%;
    }
  }
}
</style>