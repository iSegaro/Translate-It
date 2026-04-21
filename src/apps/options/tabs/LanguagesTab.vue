<template>
  <section class="options-tab-content languages-tab">
    <h2>{{ t('languages_section_title') || 'Languages' }}</h2>

    <div class="settings-container">
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
          class="language-dropdown"
        />
      </div>

      <div class="setting-group">
        <label>{{ t('target_language_label') || 'Target Language' }}</label>
        <LanguageDropdown
          v-model="targetLanguage"
          :languages="filteredTargetLanguages"
          type="target"
          class="language-dropdown"
        />
      </div>

      <div class="section-separator" />

      <!-- API Settings Accordion -->
      <BaseAccordion
        :is-open="activeAccordion === 'api'"
        item-class="api-settings-accordion"
        @toggle="toggleAccordion('api')"
      >
        <template #header>
          <span>{{ t('translation_api_label') || 'API Choice & Provider Settings' }}</span>
        </template>

        <template #content>
          <div class="accordion-inner">
            <div class="api-settings-section">
              <div class="setting-group">
                <label>{{ t('translation_api_label') || 'API Choice' }}</label>
                <ProviderSelector 
                  v-model="selectedProvider" 
                  mode="button"
                  :is-global="false"
                />
              </div>

              <div class="provider-settings-container">
                <Transition name="fade-slide">
                  <div 
                    :key="selectedProvider"
                    class="provider-settings"
                  >
                    <!-- Optimization Level Section (Visible for all providers) -->
                    <div class="optimization-control-area">
                      <div class="opt-control-group">
                        <div class="label-with-value">
                          <label class="opt-label">{{ t('optimization_level_label') || 'Translation Strategy (Speed vs. Cost)' }}</label>
                          <span
                            class="level-badge"
                            :class="'level-' + currentOptimizationLevel"
                          >
                            {{ t('optimization_level_' + currentOptimizationLevel) || 'Level ' + currentOptimizationLevel }}
                          </span>
                        </div>
                        
                        <div class="slider-wrapper">
                          <input 
                            v-model.number="currentOptimizationLevel" 
                            type="range" 
                            min="1" 
                            max="5"
                            class="ti-range-slider"
                          >
                          <div class="slider-labels">
                            <span @click="currentOptimizationLevel = 1">{{ isAIProvider ? t('opt_economy') || 'Economy' : t('opt_stable') || 'Stable' }}</span>
                            <span 
                              class="slider-tick" 
                              @click="currentOptimizationLevel = 2"
                            >|</span>
                            <span @click="currentOptimizationLevel = 3">{{ t('opt_balanced') || 'Balanced' }}</span>
                            <span 
                              class="slider-tick" 
                              @click="currentOptimizationLevel = 4"
                            >|</span>
                            <span @click="currentOptimizationLevel = 5">{{ isAIProvider ? t('opt_turbo') || 'Turbo' : t('opt_fast') || 'Fast' }}</span>
                          </div>
                        </div>
                        
                        <p class="opt-description">
                          {{ isAIProvider 
                            ? t('optimization_description_ai') || "Choose between 'Economy' to maximize token efficiency, or 'Turbo' for the fastest possible UI updates." 
                            : t('optimization_description_traditional') || "Balance your API usage and IP stability against translation speed. Higher efficiency reduces request frequency to prevent rate-limiting." 
                          }}
                        </p>
                      </div>
                    </div>

                    <div class="section-separator mini" />

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
                </Transition>
              </div>
            </div>
          </div>
        </template>
      </BaseAccordion>

      <!-- Bilingual Translation Setting (Accordion Style) -->
      <BaseAccordion
        :is-open="activeAccordion === 'bilingual'"
        item-class="bilingual-setting"
        @toggle="toggleAccordion('bilingual')"
      >
        <template #header>
          <div class="checkbox-area">
            <!-- Small Checkbox only with specific class -->
            <BaseCheckbox
              v-model="bilingualTranslation"
              class="bilingual-main-checkbox"
              @click.stop
            />
            <!-- Clickable Title Text with smart logic -->
            <span 
              class="accordion-title-text"
              :class="{ active: activeAccordion === 'bilingual' }"
            >
              {{ t('bilingual_translation_label') || 'Bilingual Translation (Swap Language)' }}
            </span>
          </div>
        </template>

        <template #content>
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
        </template>
      </BaseAccordion>

      <!-- Language Detection Preferences (Accordion Style) -->
      <BaseAccordion
        :is-open="activeAccordion === 'detection'"
        item-class="language-pref-setting"
        @toggle="toggleAccordion('detection')"
      >
        <template #header>
          <span>{{ t('language_detection_label') || 'Language Detection Preferences' }}</span>
        </template>

        <template #content>
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
        </template>
      </BaseAccordion>

      <!-- AI Optimization (Accordion Style) -->
      <BaseAccordion
        :is-open="activeAccordion === 'ai'"
        item-class="ai-optimization-setting"
        @toggle="toggleAccordion('ai')"
      >
        <template #header>
          <span>{{ t('ai_optimization_section_title') || 'AI Optimization' }}</span>
        </template>

        <template #content>
          <div class="accordion-inner">
            <div class="setting-group vertical">
              <BaseCheckbox
                v-model="aiContextEnabled"
                :label="t('ai_context_translation_label') || 'Smart Context Understanding'"
              />
              <p class="setting-description mb-md">
                {{ t('ai_context_translation_description') }}
              </p>
            </div>

            <div class="setting-group vertical">
              <BaseCheckbox
                v-model="aiHistoryEnabled"
                :label="t('ai_conversation_history_label') || 'Conversation Memory'"
              />
              <p class="setting-description mb-md">
                {{ t('ai_conversation_history_description') }}
              </p>
            </div>
          </div>
        </template>
      </BaseAccordion>
    </template>

    <!-- Validation errors -->
    <div
      v-if="validationError"
      class="validation-error"
    >
      {{ validationError }}
    </div>
    </div>
  </section>
</template>

<script setup>
import './LanguagesTab.scss'
import { ref, onMounted, watch, computed, defineAsyncComponent } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useValidation } from '@/core/validation.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { TranslationMode } from '@/shared/config/config.js'
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseAccordion from '@/components/base/BaseAccordion.vue'
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

// AI Optimization settings
const aiContextEnabled = computed({
  get: () => settingsStore.settings?.SMART_CONTEXT_TRANSLATION_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('SMART_CONTEXT_TRANSLATION_ENABLED', value)
})

const aiHistoryEnabled = computed({
  get: () => settingsStore.settings?.AI_CONVERSATION_HISTORY_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('AI_CONVERSATION_HISTORY_ENABLED', value)
})

// Provider Optimization Level (Per-provider)
const currentOptimizationLevel = computed({
  get: () => {
    const providerLevels = settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS || {}
    return providerLevels[selectedProvider.value] || settingsStore.settings?.OPTIMIZATION_LEVEL || 3
  },
  set: (value) => {
    const providerLevels = { ...(settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS || {}) }
    providerLevels[selectedProvider.value] = value
    settingsStore.updateSettingLocally('PROVIDER_OPTIMIZATION_LEVELS', providerLevels)
  }
})

const isAIProvider = computed(() => {
  return ['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(selectedProvider.value)
})

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

    // Always ensure accordion is open when checkbox is turned on
    activeAccordion.value = 'bilingual';
  } else if (activeAccordion.value === 'bilingual') {
    // Close if it was open when turned off
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
