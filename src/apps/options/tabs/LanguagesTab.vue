<template>
  <section class="options-tab-content">
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
      v-if="validationError"
      class="validation-error"
    >
      {{ validationError }}
    </div>

    <!-- Separator for API Settings section -->
    <div class="section-separator" />

    <!-- API Settings Section -->
    <div class="api-settings-section">
      <h3>{{ t('api_section_title') || 'Translation API' }}</h3>

      <div class="setting-group">
        <label>{{ t('translation_api_label') || 'API Choice' }}</label>
        <ProviderSelector 
          v-model="selectedProvider" 
          mode="button"
          :is-global="false"
        />
      </div>

      <div class="provider-settings">
        <div
          v-if="selectedProviderInfo"
          class="api-info"
        >
          <h3>{{ t(selectedProviderInfo.titleKey) || selectedProviderInfo.name }}</h3>
          <p class="setting-description">
            {{ t(selectedProviderInfo.descriptionKey) || selectedProviderInfo.name }}
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
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
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
const targetLanguage = ref(settingsStore.settings?.TARGET_LANGUAGE || 'fa')

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
      l.code === 'en' || getCanonicalCode(l.code) === 'en'
    )
    targetLanguage.value = english?.code || filteredTargetLanguages.value[0]?.code || 'en'
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
        l.code === 'en' || getCanonicalCode(l.code) === 'en'
      )
      targetLanguage.value = english?.code || filteredTargetLanguages.value[0]?.code || 'en'
      logger.debug('Target language not supported with new beta setting, reset to', targetLanguage.value)
    }
  }
})

// Sync with settings on mount
onMounted(async () => {
  await loadLanguages();
  sourceLanguage.value = settingsStore.settings?.SOURCE_LANGUAGE || 'auto'
  targetLanguage.value = settingsStore.settings?.TARGET_LANGUAGE || 'fa'
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
const selectedProvider = ref(settingsStore.settings?.TRANSLATION_API || ProviderRegistryIds.GOOGLE_V2)

const selectedProviderInfo = computed(() => {
  return findProviderById(selectedProvider.value)
})

// Dynamically load the settings component based on the selected provider
const providerSettingsComponent = computed(() => {
  const provider = selectedProvider.value;
  switch (provider) {
    case 'gemini':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/GeminiApiSettings.vue'));
    case 'deepl':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/DeepLApiSettings.vue'));
    case 'browser':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/BrowserApiSettings.vue'));
    case 'webai':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/WebAIApiSettings.vue'));
    case 'lingva':
      return defineAsyncComponent(() => import('@/components/feature/api-settings/LingvaApiSettings.vue'));
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

// Reactive translated validation error
const validationError = computed(() => {
  if (!validationErrorKey.value) return ''

  const sourceError = getFirstErrorTranslated('sourceLanguage', t)
  const targetError = getFirstErrorTranslated('targetLanguage', t)
  return sourceError || targetError || ''
})

const validateLanguages = async () => {
  clearErrors()
  const isValid = await validate(sourceLanguage.value, targetLanguage.value)

  if (!isValid) {
    // Get the error key (not translated) for reactive translation
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

// API Settings Section
.api-settings-section {
  margin-top: $spacing-xl;

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

  // --- Alignment for API Settings ---
  
  .provider-settings {
    // Make all provider settings stacked (Label top, Input bottom)
    :deep(.setting-group):not(.api-key-info) {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      width: 100% !important;
      gap: 4px !important; // Consistent tight gap

      label {
        flex: 0 0 auto !important;
        margin-bottom: 0 !important;
        width: 100% !important;
      }

      // All inputs/selects should be full width to be consistent with API Key field
      .ti-select, 
      .ti-input, 
      .ti-provider-select,
      .tier-select,
      .formality-select,
      .api-key-input-wrapper {
        flex: 0 0 100% !important;
        width: 100% !important;
        max-width: 100% !important;
      }

      .setting-description:not(.api-key-info *) {
        flex: 0 0 100%;
        margin-top: 0;
        opacity: 0.8;
      }
    }

    // Fix for API Key Info row (ensure it stays inline/row)
    :deep(.api-key-info) {
      display: flex !important;
      flex-direction: row !important;
      flex-wrap: wrap !important;
      align-items: center !important;
      gap: $spacing-xs !important;
      margin-bottom: $spacing-md !important;

      .setting-description {
        flex: 0 0 auto !important;
        width: auto !important;
        display: inline !important;
      }

      .api-link {
        margin: 0 $spacing-xs;
      }
    }

    // Special handling for the API Key label row
    :deep(.label-with-toggle) {
      display: grid !important;
      grid-template-columns: 1fr auto !important; 
      align-items: center !important;
      width: 100% !important;
      gap: $spacing-md !important;
      margin-bottom: 0 !important;

      label {
        margin: 0 !important;
        min-width: 0 !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .toggle-visibility-button {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 32px !important; // Fixed button size
        height: 32px !important;
        padding: 0 !important;
        background: none !important;
        border: none !important;
        margin: 0 !important;
        cursor: pointer;
        opacity: 0.7;

        &:hover {
          opacity: 1;
        }

        .toggle-icon {
          width: 16px;
          height: 16px;
          display: block;
          transition: filter var(--transition-base, 0.2s);

          // Invert icon color in dark mode (from black to white/light gray)
          :root.theme-dark &,
          .theme-dark & {
            filter: invert(1) brightness(1.5);
          }
        }
      }
    }
  }
}

.setting-group {
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-md;
  
  label {
    margin-bottom: 0;
    flex: 1;
    white-space: nowrap;
  }
  
  .language-dropdown,
  :deep(.ti-provider-button-container) {
    flex: 0 0 250px !important;
    width: 250px !important;
    height: auto;

    .ti-provider-button {
      width: 100% !important;
    }
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

// Tablet & Mobile responsive
@media (max-width: #{$breakpoint-lg}) {
  .setting-group {
    flex-direction: column !important;
    align-items: stretch !important;
    gap: $spacing-sm !important;
    
    label {
      min-width: auto !important;
      margin-bottom: $spacing-xs !important;
    }
    
    .language-dropdown,
    :deep(.ti-provider-button-container) {
      min-width: auto !important;
      width: 100% !important;
      flex: none !important;
    }
  }
}
</style>