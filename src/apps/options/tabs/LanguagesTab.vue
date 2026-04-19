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

      <!-- Bilingual Translation Setting (Accordion Style) -->
      <div class="setting-group bilingual-setting accordion-item">
        <div class="accordion-header-wrapper">
          <div class="checkbox-area">
            <!-- Small Checkbox only with specific class -->
            <BaseCheckbox
              v-model="bilingualTranslation"
              class="bilingual-main-checkbox"
            />
            <!-- Clickable Title Text with smart logic -->
            <span 
              class="accordion-title-text"
              :class="{ disabled: !bilingualTranslation, active: activeAccordion === 'bilingual' }"
              @click="bilingualTranslation ? toggleAccordion('bilingual') : (bilingualTranslation = true)"
            >
              {{ t('bilingual_translation_label') || 'Bilingual Translation (Swap Language)' }}
            </span>
          </div>
          
          <!-- Right Side: Manual Toggle Icon -->
          <div 
            v-if="bilingualTranslation"
            class="accordion-trigger-area"
            :class="{ active: activeAccordion === 'bilingual' }"
            @click="toggleAccordion('bilingual')"
          >
            <span class="accordion-icon">{{ activeAccordion === 'bilingual' ? '−' : '+' }}</span>
          </div>
        </div>

        <div
          v-if="bilingualTranslation"
          class="accordion-content"
          :class="{ open: activeAccordion === 'bilingual' }"
        >
          <div class="accordion-inner">
            <p class="setting-description mb-md">
              {{ t('bilingual_translation_description') || 'If the detected input language matches your target language, it will automatically translate back to your source language (or English if source is Auto).' }}
            </p>

            <div class="bilingual-modes-list">
              <BaseCheckbox
                v-model="bilingualTranslationModes[TranslationMode.Selection]"
                :label="t('bilingual_mode_selection_label') || 'Text Selection (WindowsManager)'"
                class="mode-checkbox"
              />
              <BaseCheckbox
                v-model="bilingualTranslationModes[TranslationMode.Select_Element]"
                :label="t('bilingual_mode_select_element_label') || 'Select Element'"
                class="mode-checkbox"
              />
              <BaseCheckbox
                v-model="bilingualTranslationModes[TranslationMode.Field]"
                :label="t('bilingual_mode_field_label') || 'Text Fields'"
                class="mode-checkbox"
              />
              <BaseCheckbox
                v-model="bilingualTranslationModes[TranslationMode.Popup_Translate]"
                :label="t('bilingual_mode_popup_label') || 'Popup & Sidepanel'"
                class="mode-checkbox"
              />
              <BaseCheckbox
                v-model="bilingualTranslationModes[TranslationMode.Page]"
                :label="t('bilingual_mode_page_label') || 'Whole Page Translation'"
                class="mode-checkbox"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Language Detection Preferences (Accordion Style) -->
      <div class="setting-group language-pref-setting accordion-item">
        <button
          class="accordion-header"
          :class="{ active: activeAccordion === 'detection' }"
          @click="toggleAccordion('detection')"
        >
          <span>{{ t('language_detection_label') || 'Language Detection Preferences' }}</span>
          <span class="accordion-icon">{{ activeAccordion === 'detection' ? '−' : '+' }}</span>
        </button>

        <div
          class="accordion-content"
          :class="{ open: activeAccordion === 'detection' }"
        >
          <div class="accordion-inner">
            <p class="setting-description mb-md">
              {{ t('language_detection_preferences_description') || 'Choose which language should be prioritized when text contains scripts shared by multiple languages.' }}
            </p>

            <div class="language-pref-row">
              <label class="pref-label">
                {{ t('arabic_script_priority_label') || 'Arabic Script:' }}
              </label>
              <select
                v-model="arabicScriptPreference"
                class="pref-select"
              >
                <option value="fa">
                  {{ t('persian_language_name') || 'Persian' }} ({{ t('default_label') || 'Default' }})
                </option>
                <option value="ar">
                  {{ t('arabic_language_name') || 'Arabic' }}
                </option>
                <option value="ur">
                  {{ t('urdu_language_name') || 'Urdu' }}
                </option>
                <option value="ps">
                  {{ t('pashto_language_name') || 'Pashto' }}
                </option>
              </select>
            </div>

            <div class="language-pref-row">
              <label class="pref-label">
                {{ t('chinese_script_priority_label') || 'Chinese Script:' }}
              </label>
              <select
                v-model="chineseScriptPreference"
                class="pref-select"
              >
                <option value="zh-cn">
                  {{ t('chinese_simplified_name') || 'Chinese (Simplified)' }} ({{ t('default_label') || 'Default' }})
                </option>
                <option value="zh-tw">
                  {{ t('chinese_traditional_name') || 'Chinese (Traditional)' }}
                </option>
                <option value="lzh">
                  {{ t('chinese_classical_name') || 'Chinese (Classical)' }}
                </option>
                <option value="yue">
                  {{ t('chinese_cantonese_name') || 'Cantonese' }}
                </option>
              </select>
            </div>

            <div class="language-pref-row">
              <label class="pref-label">
                {{ t('devanagari_script_priority_label') || 'Devanagari Script:' }}
              </label>
              <select
                v-model="devanagariScriptPreference"
                class="pref-select"
              >
                <option value="hi">
                  {{ t('hindi_language_name') || 'Hindi' }} ({{ t('default_label') || 'Default' }})
                </option>
                <option value="mr">
                  {{ t('marathi_language_name') || 'Marathi' }}
                </option>
                <option value="ne">
                  {{ t('nepali_language_name') || 'Nepali' }}
                </option>
              </select>
            </div>
          </div>
        </div>
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
          v-if="selectedProviderInfo && !providerSettingsComponent"
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
import { TranslationMode } from '@/shared/config/config.js'
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { useI18n } from 'vue-i18n'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PROVIDER_SUPPORTED_LANGUAGES, getCanonicalCode, getProviderLanguageCode } from '@/shared/config/languageConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguagesTab')

const settingsStore = useSettingsStore()
const { validateLanguages: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()
const { allLanguages, loadLanguages, isLoaded } = useLanguages()

const { t } = useI18n()

// Accordion state management
const activeAccordion = ref(null) // 'bilingual' or 'detection'

const toggleAccordion = (name) => {
  if (activeAccordion.value === name) {
    activeAccordion.value = null
  } else {
    activeAccordion.value = name
  }
}

// Form values as refs
const sourceLanguage = ref(settingsStore.settings?.SOURCE_LANGUAGE || 'auto')
const targetLanguage = ref(settingsStore.settings?.TARGET_LANGUAGE || 'fa')
const bilingualTranslation = ref(settingsStore.settings?.BILINGUAL_TRANSLATION ?? false)
const bilingualTranslationModes = ref({ ...(settingsStore.settings?.BILINGUAL_TRANSLATION_MODES || {}) })
const arabicScriptPreference = ref(settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES?.['arabic-script'] || 'fa')
const chineseScriptPreference = ref(settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES?.['chinese-script'] || 'zh-cn')
const devanagariScriptPreference = ref(settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES?.['devanagari-script'] || 'hi')

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

  // Resolve effective provider and mapping keys
  let providerKey = provider.toLowerCase();
  let mappingKey = 'GOOGLE';
  
  if (providerKey.includes('deepl')) {
    const betaEnabled = settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true
    providerKey = betaEnabled ? 'deepl_beta' : 'deepl';
    mappingKey = 'DEEPL';
  } else if (providerKey.includes('google')) {
    providerKey = 'google';
    mappingKey = 'GOOGLE';
  } else if (providerKey.includes('lingva')) {
    providerKey = 'google';
    mappingKey = 'LINGVA';
  } else if (providerKey.includes('bing') || providerKey.includes('edge')) {
    providerKey = 'bing';
    mappingKey = 'BING';
  } else if (providerKey.includes('yandex')) {
    providerKey = 'yandex';
    mappingKey = 'YANDEX';
  } else if (providerKey.includes('browser')) {
    providerKey = 'browserapi';
    mappingKey = 'BROWSER';
  }

  const supportedCodes = PROVIDER_SUPPORTED_LANGUAGES[providerKey];
  if (!supportedCodes) return [autoOption, ...languages];

  const filtered = languages.filter(lang => {
    const providerCode = getProviderLanguageCode(lang.code, mappingKey);
    return supportedCodes.includes(providerCode) || supportedCodes.includes(lang.code);
  })

  return [autoOption, ...filtered]
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

  // Resolve effective provider and mapping keys
  let providerKey = provider.toLowerCase();
  let mappingKey = 'GOOGLE';
  
  if (providerKey.includes('deepl')) {
    const betaEnabled = settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true
    providerKey = betaEnabled ? 'deepl_beta' : 'deepl';
    mappingKey = 'DEEPL';
  } else if (providerKey.includes('google')) {
    providerKey = 'google';
    mappingKey = 'GOOGLE';
  } else if (providerKey.includes('lingva')) {
    providerKey = 'google';
    mappingKey = 'LINGVA';
  } else if (providerKey.includes('bing') || providerKey.includes('edge')) {
    providerKey = 'bing';
    mappingKey = 'BING';
  } else if (providerKey.includes('yandex')) {
    providerKey = 'yandex';
    mappingKey = 'YANDEX';
  } else if (providerKey.includes('browser')) {
    providerKey = 'browserapi';
    mappingKey = 'BROWSER';
  }

  const supportedCodes = PROVIDER_SUPPORTED_LANGUAGES[providerKey];
  if (!supportedCodes) return languages;

  return languages.filter(lang => {
    const providerCode = getProviderLanguageCode(lang.code, mappingKey);
    return supportedCodes.includes(providerCode) || supportedCodes.includes(lang.code);
  })
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
  bilingualTranslation.value = settingsStore.settings?.BILINGUAL_TRANSLATION ?? false
  bilingualTranslationModes.value = { ...(settingsStore.settings?.BILINGUAL_TRANSLATION_MODES || {}) }
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
watch(bilingualTranslation, (value) => {
  // UX Improvement: If user turns ON the master switch but all visible modes are OFF,
  // enable some logical defaults so the feature isn't "dead".
  if (value) {
    const visibleModes = [
      TranslationMode.Selection,
      TranslationMode.Select_Element,
      TranslationMode.Field,
      TranslationMode.Popup_Translate,
      TranslationMode.Page
    ];
    const anyVisibleEnabled = visibleModes.some(mode => bilingualTranslationModes.value[mode] === true);
    
    if (!anyVisibleEnabled) {
      bilingualTranslationModes.value[TranslationMode.Selection] = true;
      bilingualTranslationModes.value[TranslationMode.Popup_Translate] = true;
      bilingualTranslationModes.value[TranslationMode.Sidepanel_Translate] = true;
      bilingualTranslationModes.value[TranslationMode.Select_Element] = true;
      bilingualTranslationModes.value[TranslationMode.Field] = true;
    }

    // Auto-open this accordion and close others when enabled
    activeAccordion.value = 'bilingual';
  } else if (activeAccordion.value === 'bilingual') {
    // Close if it was open
    activeAccordion.value = null;
  }
  
  settingsStore.updateSettingLocally('BILINGUAL_TRANSLATION', value)
})

watch(bilingualTranslationModes, (newModes) => {
  // UX Improvement: If user unchecks ALL visible modes while the master switch is ON,
  // automatically turn OFF the master switch since it has no effect.
  const visibleModes = [
    TranslationMode.Selection,
    TranslationMode.Select_Element,
    TranslationMode.Field,
    TranslationMode.Popup_Translate,
    TranslationMode.Page
  ];
  const anyVisibleEnabled = visibleModes.some(mode => newModes[mode] === true);

  if (!anyVisibleEnabled && bilingualTranslation.value) {
    bilingualTranslation.value = false;
  }
  
  // Also keep Sidepanel in sync with Popup for consistency
  if (newModes[TranslationMode.Popup_Translate] !== undefined) {
    newModes[TranslationMode.Sidepanel_Translate] = newModes[TranslationMode.Popup_Translate];
  }
  
  settingsStore.updateSettingLocally('BILINGUAL_TRANSLATION_MODES', { ...newModes })
}, { deep: true })

// Language Detection Preferences
watch(arabicScriptPreference, (value) => {
  const preferences = settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES || {}
  preferences['arabic-script'] = value
  settingsStore.updateSettingLocally('LANGUAGE_DETECTION_PREFERENCES', preferences)
})

watch(chineseScriptPreference, (value) => {
  const preferences = settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES || {}
  preferences['chinese-script'] = value
  settingsStore.updateSettingLocally('LANGUAGE_DETECTION_PREFERENCES', preferences)
})

watch(devanagariScriptPreference, (value) => {
  const preferences = settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES || {}
  preferences['devanagari-script'] = value
  settingsStore.updateSettingLocally('LANGUAGE_DETECTION_PREFERENCES', preferences)
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

.accordion-item {
  margin-top: $spacing-xs; // Compact margin
  border-top: 1px solid var(--color-border);
  padding: 0;
  display: flex;
  flex-direction: column !important;
  align-items: stretch !important;

  .accordion-header-wrapper, .accordion-header {
    width: 100%;
    padding: $spacing-sm 0; // Compact padding
    background: transparent;
    border: none;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    transition: color $transition-base;

    &:hover {
      color: var(--color-primary);
    }

    &.active {
      color: var(--color-primary);
    }
  }

  // Special header for bilingual (checkbox + trigger)
  .accordion-header-wrapper {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .checkbox-area {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 16px; // Very small gap between checkbox and text
      
      :deep(.bilingual-main-checkbox) {
        gap: 0 !important; // Force remove internal gap
        width: auto !important;
        flex: none !important;
        margin: 0 !important;

        .ti-checkbox__label {
          display: none !important; // Completely remove label space
        }
      }

      .accordion-title-text {
        flex: 1;
        cursor: pointer;
        user-select: none;
        padding: 4px 0;
        transition: color $transition-base;

        &:hover {
          color: var(--color-primary);
        }

        &.active {
          color: var(--color-primary);
          font-weight: $font-weight-medium;
        }

        &.disabled {
          opacity: 0.9;
        }
      }
    }

    .accordion-trigger-area {
      padding: $spacing-sm $spacing-md; // Compact padding
      cursor: pointer;
      color: var(--color-text-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color $transition-base;
      margin-inline-end: -$spacing-md;

      &:hover, &.active {
        color: var(--color-primary);
      }

      .accordion-icon {
        font-size: $font-size-base;
        font-weight: $font-weight-bold;
        pointer-events: none;
      }
    }
  }

  .accordion-content {
    max-height: 0;
    overflow: hidden;
    transition: max-height $transition-slow ease-out;
    width: 100%;

    &.open {
      max-height: 800px;
      transition: max-height $transition-slow ease-in;
    }

    .accordion-inner {
      padding: 0 0 $spacing-md 0;
    }
  }

  .setting-description {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    line-height: 1.4;
    margin-bottom: $spacing-sm;

    &.mb-md {
      margin-inline-start: 28px;
    }
  }

  .bilingual-modes-list {
    margin-inline-start: 28px;
    display: flex;
    flex-direction: column;
    gap: $spacing-xs; // Compact gap between modes

    .mode-checkbox {
      margin-bottom: 0;
      
      :deep(.checkbox-label) {
        font-size: $font-size-sm;
      }
    }
  }

  .language-pref-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-md;
    margin-bottom: $spacing-xs; // Compact vertical gap

    .pref-label {
      font-size: $font-size-sm; // Slightly smaller label
      color: var(--color-text-secondary);
      flex: 1;
    }

    .pref-select {
      flex: 0 0 180px; // Slightly narrower select
      padding: 4px $spacing-sm; // Tighter padding
      border: 1px solid var(--color-border);
      border-radius: $border-radius-sm;
      background-color: var(--color-background);
      color: var(--color-text);
      font-size: $font-size-sm;
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

:global(.options-layout.rtl) {
  .language-pref-setting .accordion-header {
    display: flex !important;
    flex-direction: row-reverse !important;
    justify-content: space-between !important;
    text-align: right !important;
  }
}
</style>