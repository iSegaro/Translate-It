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
        <div 
          v-if="isAutoLanguageProvider" 
          class="smart-language-info-banner"
        >
          <div class="banner-content">
            <h3>{{ t('smart_language_title') || 'Smart Language Handling' }}</h3>
            <p>{{ t('smart_language_description') || 'This provider is specialized for the Persian language, providing dictionary results for English, Arabic, and Turkish in relation to Persian.' }}</p>
          </div>
        </div>

        <div class="languages-selectors-container">
          <div class="setting-group">
            <label>{{ t('source_language_label') || 'Source Language' }}</label>
            <LanguageDropdown
              id="SOURCE_LANGUAGE"
              v-model="sourceLanguage"
              :languages="filteredSourceLanguages"
              type="source"
              class="language-dropdown"
            />
          </div>

          <div class="setting-group">
            <label>{{ t('target_language_label') || 'Target Language' }}</label>
            <LanguageDropdown
              id="TARGET_LANGUAGE"
              v-model="targetLanguage"
              :languages="filteredTargetLanguages"
              type="target"
              class="language-dropdown"
            />
          </div>

          <p 
            v-if="isAutoLanguageProvider" 
            class="smart-language-fallback-note"
          >
            {{ t('smart_language_fallback_note') }}
          </p>
        </div>

        <div class="section-separator" />

        <!-- Validation errors -->
        <Transition name="fade-slide">
          <div
            v-if="validationError"
            class="validation-error"
          >
            <span class="error-icon">⚠️</span>
            <span class="error-message">{{ validationError }}</span>
          </div>
        </Transition>

        <!-- API Settings Accordion -->
        <BaseAccordion
          id="TRANSLATION_API"
          :is-open="activeAccordion === 'api'"
          item-class="api-settings-accordion"
          @toggle="toggleAccordion('api')"
        >
          <template #header>
            <div class="accordion-header-layout">
              <span>{{ t('translation_api_label') || 'Service' }}</span>
              <div 
                class="header-selector-wrapper"
                @click.stop
              >
                <ProviderSelector 
                  v-model="selectedProvider" 
                  mode="button"
                  :is-global="false"
                />
              </div>
            </div>
          </template>

          <template #content>
            <div class="accordion-inner">
              <div class="api-settings-section">
                <div class="provider-settings-container">
                  <Transition name="fade-slide">
                    <div 
                      :key="selectedProvider"
                      class="provider-settings"
                    >
                      <!-- Optimization Level Section -->
                      <template v-if="!isAutoLanguageProvider">
                        <div 
                          id="OPTIMIZATION_LEVELS_SECTION"
                          class="optimization-control-area"
                        >
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
                                ? t('optimization_description_ai') 
                                : t('optimization_description_traditional') 
                              }}
                            </p>
                          </div>
                        </div>

                        <div class="section-separator mini" />
                      </template>

                      <div
                        v-if="selectedProviderInfo && !providerSettingsComponent"
                        class="api-info"
                      >
                        <h3>{{ t(selectedProviderInfo.titleKey) || selectedProviderInfo.name }}</h3>
                        <p class="setting-description">
                          {{ t(selectedProviderInfo.descriptionKey) }}
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

        <!-- Dictionary Mode -->
        <BaseAccordion
          id="DICTIONARY_SECTION"
          :is-open="activeAccordion === 'dictionary'"
          item-class="dictionary-mode-setting"
          @toggle="toggleAccordion('dictionary')"
        >
          <template #header>
            <div class="checkbox-area">
              <BaseCheckbox
                v-model="enableDictionary"
                class="dictionary-main-checkbox"
                @click.stop
              />
              <span 
                class="accordion-title-text"
                :class="{ active: activeAccordion === 'dictionary' }"
              >
                {{ t('activation_group_dictionary_title') || 'Dictionary Mode' }}
              </span>
            </div>
          </template>

          <template #content>
            <div class="accordion-inner">
              <div class="dictionary-content-wrapper">
                <div class="setting-group dictionary-provider-group mb-md">
                  <label 
                    class="setting-label"
                    :class="{ 'is-disabled': !enableDictionary }"
                  >{{ t('translation_api_label') || 'Service' }}:</label>
                  <ProviderSelector 
                    v-model="dictionaryProvider" 
                    mode="button"
                    :is-global="false"
                    allow-default
                    required-feature="dictionary"
                    :disabled="!enableDictionary"
                  />
                </div>
                <p class="setting-description">
                  {{ t('enable_dictionary_translation_description') }}
                </p>

                <!-- Dictionary Display Options -->
                <div 
                  id="DICTIONARY_DISPLAY_OPTIONS"
                  class="dictionary-display-options mt-md"
                  :class="{ 'is-disabled': !enableDictionary || !isGoogleDictionary }"
                >
                  <label class="setting-label mb-sm">{{ t('dict_setting_display_options') || 'Display Options' }}:</label>
                  <div class="checkbox-list-vertical">
                    <BaseCheckbox 
                      v-model="showPronunciation" 
                      :label="t('dict_setting_show_pronunciation')" 
                      :disabled="!enableDictionary || !isGoogleDictionary"
                      class="mb-xs"
                    />
                    <BaseCheckbox 
                      v-model="showPos" 
                      :label="t('dict_setting_show_pos')" 
                      :disabled="!enableDictionary || !isGoogleDictionary"
                      class="mb-xs"
                    />
                    <BaseCheckbox 
                      v-model="showDefinitions" 
                      :label="t('dict_setting_show_definitions')" 
                      :disabled="!enableDictionary || !isGoogleDictionary"
                      class="mb-xs"
                    />
                    <BaseCheckbox 
                      v-model="showExamples" 
                      :label="t('dict_setting_show_examples')" 
                      :disabled="!enableDictionary || !isGoogleDictionary"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </BaseAccordion>

        <!-- Bilingual Translation Setting -->
        <BaseAccordion
          id="BILINGUAL_SECTION"
          :is-open="activeAccordion === 'bilingual'"
          item-class="bilingual-setting"
          @toggle="toggleAccordion('bilingual')"
        >
          <template #header>
            <div class="checkbox-area">
              <BaseCheckbox
                v-model="bilingualTranslation"
                class="bilingual-main-checkbox"
                @click.stop
              />
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
                {{ t('bilingual_translation_description') }}
              </p>

              <div class="bilingual-modes-list">
                <BaseCheckbox
                  v-for="mode in visibleBilingualModes"
                  :key="mode"
                  :model-value="bilingualTranslationModes[mode]"
                  :label="modeLabels[mode]"
                  class="mode-checkbox"
                  @update:model-value="updateBilingualMode(mode, $event)"
                />
              </div>
            </div>
          </template>
        </BaseAccordion>

        <!-- Language Detection Preferences -->
        <BaseAccordion
          id="DETECTION_SECTION"
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
                {{ t('language_detection_preferences_description') }}
              </p>

              <div class="language-pref-row">
                <label class="pref-label">{{ t('latin_script_priority_label') }}:</label>
                <BaseSelect
                  v-model="latinScriptPreference"
                  :options="latinScriptOptions"
                  class="pref-select"
                />
              </div>

              <div class="language-pref-row">
                <label class="pref-label">{{ t('arabic_script_priority_label') }}:</label>
                <BaseSelect
                  v-model="arabicScriptPreference"
                  :options="arabicScriptOptions"
                  class="pref-select"
                />
              </div>

              <div class="language-pref-row">
                <label class="pref-label">{{ t('chinese_script_priority_label') }}:</label>
                <BaseSelect
                  v-model="chineseScriptPreference"
                  :options="chineseScriptOptions"
                  class="pref-select"
                />
              </div>

              <div class="language-pref-row">
                <label class="pref-label">{{ t('devanagari_script_priority_label') }}:</label>
                <BaseSelect
                  v-model="devanagariScriptPreference"
                  :options="devanagariScriptOptions"
                  class="pref-select"
                />
              </div>
            </div>
          </template>
        </BaseAccordion>

        <!-- AI Optimization -->
        <BaseAccordion
          id="AI_OPT_SECTION"
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
                  :label="t('ai_context_translation_label')"
                />
                <p class="setting-description mb-md">
                  {{ t('ai_context_translation_description') }}
                </p>
              </div>

              <div class="setting-group vertical">
                <BaseCheckbox
                  v-model="aiHistoryEnabled"
                  :label="t('ai_conversation_history_label')"
                />
                <p class="setting-description mb-md">
                  {{ t('ai_conversation_history_description') }}
                </p>
              </div>
            </div>
          </template>
        </BaseAccordion>
      </template>
    </div>
  </section>
</template>

<script setup>
import './LanguagesTab.scss'
import { ref, onMounted, onUnmounted, watch, computed, defineAsyncComponent } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { useValidation } from '@/core/validation.js'
import { useLanguages } from '@/composables/shared/useLanguages.js'
import { TranslationMode } from '@/shared/config/config.js'
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { PROVIDER_SUPPORTED_LANGUAGES, PROVIDER_LANGUAGE_PAIRS, getCanonicalCode, getProviderLanguageCode } from '@/shared/config/languageConstants.js'
import { getFirstMissingSetting } from '@/features/translation/utils/providerValidator.js'
import { useHighlightManager } from '../composables/useHighlightManager.js'

// Components
import LanguageDropdown from '@/components/feature/LanguageDropdown.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseAccordion from '@/components/base/BaseAccordion.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'LanguagesTab')
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const { highlightElement } = useHighlightManager()
const { createSetting, createProviderSetting } = useTabSettings(settingsStore, logger)
const { validateLanguages: validate, getFirstError, getFirstErrorTranslated, clearErrors } = useValidation()
const { allLanguages, loadLanguages, isLoaded } = useLanguages()

// State
const activeAccordion = ref(null)
const toggleAccordion = (name) => { activeAccordion.value = activeAccordion.value === name ? null : name }

// Global reveal listener for highlighting
onMounted(() => {
  window.addEventListener('options-reveal-accordion', (e) => {
    activeAccordion.value = e.detail;
  });
})

// --- Standard Settings ---

const sourceLanguage = createSetting('SOURCE_LANGUAGE', 'auto', { onChanged: () => validateLanguages() })
const targetLanguage = createSetting('TARGET_LANGUAGE', 'fa', { onChanged: () => validateLanguages() })

const bilingualTranslation = createSetting('BILINGUAL_TRANSLATION', false, {
  onChanged: (val) => {
    if (val) {
      const currentModes = { ...(settingsStore.settings?.BILINGUAL_TRANSLATION_MODES || {}) }
      if (!visibleBilingualModes.some(m => currentModes[m])) {
        visibleBilingualModes.forEach(m => { 
          if (m !== TranslationMode.Page) {
            currentModes[m] = true 
          }
        })
        currentModes[TranslationMode.Sidepanel_Translate] = true
        settingsStore.updateSettingLocally('BILINGUAL_TRANSLATION_MODES', currentModes)
      }
      activeAccordion.value = 'bilingual'
    } else if (activeAccordion.value === 'bilingual') {
      activeAccordion.value = null
    }
  }
})

const selectedProvider = createSetting('TRANSLATION_API', ProviderRegistryIds.GOOGLE_V2, {
  onChanged: (newProvider) => {
    // Check if the selected provider needs configuration
    const missingKey = getFirstMissingSetting(newProvider, settingsStore.settings);
    
    if (missingKey) {
      logger.debug(`[LanguagesTab] Provider ${newProvider} is missing setting: ${missingKey}. Opening API accordion.`);
      activeAccordion.value = 'api';
      
      // Delay to allow accordion animation to start/finish before highlighting
      setTimeout(() => {
        highlightElement(missingKey);
      }, 400);
    }
  }
})
const aiContextEnabled = createSetting('SMART_CONTEXT_TRANSLATION_ENABLED', true)
const aiHistoryEnabled = createSetting('AI_CONVERSATION_HISTORY_ENABLED', true)

const currentOptimizationLevel = computed({
  get: () => settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS?.[selectedProvider.value] || settingsStore.settings?.OPTIMIZATION_LEVEL || 3,
  set: (val) => {
    const providerLevels = { ...(settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS || {}) }
    providerLevels[selectedProvider.value] = val
    settingsStore.updateSettingLocally('PROVIDER_OPTIMIZATION_LEVELS', providerLevels)
  }
})

// --- Bilingual Logic ---

const visibleBilingualModes = [TranslationMode.Selection, TranslationMode.Select_Element, TranslationMode.Field, TranslationMode.Popup_Translate, TranslationMode.Page]
const modeLabels = computed(() => ({
  [TranslationMode.Selection]: t('bilingual_mode_selection_label'),
  [TranslationMode.Select_Element]: t('bilingual_mode_select_element_label'),
  [TranslationMode.Field]: t('bilingual_mode_field_label'),
  [TranslationMode.Popup_Translate]: t('bilingual_mode_popup_label'),
  [TranslationMode.Page]: t('bilingual_mode_page_label')
}))

const bilingualTranslationModes = computed(() => settingsStore.settings?.BILINGUAL_TRANSLATION_MODES || {})
const updateBilingualMode = (mode, value) => {
  const newModes = { ...bilingualTranslationModes.value, [mode]: value }
  if (mode === TranslationMode.Popup_Translate) newModes[TranslationMode.Sidepanel_Translate] = value
  if (!visibleBilingualModes.some(m => newModes[m]) && bilingualTranslation.value) {
    settingsStore.updateSettingLocally('BILINGUAL_TRANSLATION', false)
  }
  settingsStore.updateSettingLocally('BILINGUAL_TRANSLATION_MODES', newModes)
}

// --- Script Detection Preferences ---

const createScriptSetting = (script, def) => computed({
  get: () => settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES?.[script] || def,
  set: (val) => {
    const preferences = { ...(settingsStore.settings?.LANGUAGE_DETECTION_PREFERENCES || {}) }
    preferences[script] = val
    logger.debug(`📝 Script preference [${script}] changed:`, val)
    settingsStore.updateSettingLocally('LANGUAGE_DETECTION_PREFERENCES', preferences)
  }
})

const arabicScriptPreference = createScriptSetting('arabic-script', 'fa')
const chineseScriptPreference = createScriptSetting('chinese-script', 'zh-cn')
const devanagariScriptPreference = createScriptSetting('devanagari-script', 'hi')
const latinScriptPreference = createScriptSetting('latin-script', 'none')

// --- Dictionary Logic ---
const enableDictionary = createSetting('ENABLE_DICTIONARY', false)
const dictionaryProvider = createProviderSetting(TranslationMode.Dictionary_Translation)
const isGoogleDictionary = computed(() => {
  const provider = dictionaryProvider.value === 'default' ? selectedProvider.value : dictionaryProvider.value
  return [ProviderRegistryIds.GOOGLE, ProviderRegistryIds.GOOGLE_V2].includes(provider)
})
const showPronunciation = createSetting('DICTIONARY_SHOW_PRONUNCIATION', true)
const showPos = createSetting('DICTIONARY_SHOW_POS', true)
const showDefinitions = createSetting('DICTIONARY_SHOW_DEFINITIONS', true)
const showExamples = createSetting('DICTIONARY_SHOW_EXAMPLES', true)

const arabicScriptOptions = computed(() => [
  { value: 'fa', label: `${t('persian_language_name')} (${t('default_label')})` },
  { value: 'ar', label: t('arabic_language_name') },
  { value: 'ur', label: t('urdu_language_name') },
  { value: 'ps', label: t('pashto_language_name') }
])

const chineseScriptOptions = computed(() => [
  { value: 'zh-cn', label: `${t('chinese_simplified_name')} (${t('default_label')})` },
  { value: 'zh-tw', label: t('chinese_traditional_name') },
  { value: 'lzh', label: t('chinese_classical_name') },
  { value: 'yue', label: t('chinese_cantonese_name') }
])

const devanagariScriptOptions = computed(() => [
  { value: 'hi', label: `${t('hindi_language_name')} (${t('default_label')})` },
  { value: 'mr', label: t('marathi_language_name') },
  { value: 'ne', label: t('nepali_language_name') }
])

const latinScriptOptions = computed(() => [
  { value: 'none', label: `${t('latin_priority_none_label')} (${t('default_label')})` },
  { value: 'en', label: t('english_language_name') },
  { value: 'fr', label: t('french_language_name') },
  { value: 'es', label: t('spanish_language_name') },
  { value: 'de', label: t('german_language_name') },
  { value: 'it', label: t('italian_language_name') },
  { value: 'pt', label: t('portuguese_language_name') },
  { value: 'tr', label: t('turkish_language_name') },
  { value: 'nl', label: t('dutch_language_name') }
])

// --- Provider & Language Logic ---

const isAIProvider = computed(() => ['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(selectedProvider.value))
const isAutoLanguageProvider = computed(() => selectedProviderInfo.value?.features?.includes('autoLanguage'))
const selectedProviderInfo = computed(() => findProviderById(selectedProvider.value))
const providerSettingsComponent = computed(() => {
  const p = selectedProvider.value
  const map = { gemini: 'Gemini', deepl: 'DeepL', browser: 'Browser', webai: 'WebAI', lingva: 'Lingva', openai: 'OpenAI', openrouter: 'OpenRouter', deepseek: 'Deepseek', custom: 'Custom' }
  return map[p] ? defineAsyncComponent(() => import(`@/components/feature/api-settings/${map[p]}ApiSettings.vue`)) : null
})

const getFilteredLanguages = (type) => {
  const provider = selectedProvider.value
  const providerInfo = findProviderById(provider)
  const languages = allLanguages.value || []
  
  // 1. Determine if Auto-Detect should be available based on provider features
  const hasAutoDetect = providerInfo?.features?.includes('autoDetect')
  
  if (!languages.length) {
    return type === 'source' && hasAutoDetect ? [{ code: 'auto', name: 'Auto-Detect' }] : []
  }

  // Bypass filtering for smart auto-language providers (like Vajehyab)
  // as the selected languages will be used as fallbacks for other features
  if (isAutoLanguageProvider.value) {
    if (type === 'source') {
      return hasAutoDetect ? [{ code: 'auto', name: 'Auto-Detect' }, ...languages] : languages
    }
    return languages
  }

  // 2. Filter base languages supported by the provider
  let filtered = languages
  if (!isAIProvider.value) {
    let providerKey = provider.toLowerCase().includes('deepl') ? (settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ? 'deepl_beta' : 'deepl') : provider.toLowerCase()
    const mappingKey = providerKey.includes('google') || providerKey.includes('lingva') ? 'GOOGLE' : providerKey.includes('bing') || providerKey.includes('edge') ? 'BING' : providerKey.includes('deepl') ? 'DEEPL' : providerKey.includes('yandex') ? 'YANDEX' : 'BROWSER'
    
    if (providerKey.includes('google') || providerKey.includes('lingva')) providerKey = 'google'
    if (providerKey.includes('bing') || providerKey.includes('edge')) providerKey = 'bing'
    
    const supported = PROVIDER_SUPPORTED_LANGUAGES[providerKey]
    if (supported) {
      filtered = languages.filter(l => supported.includes(getProviderLanguageCode(l.code, mappingKey)) || supported.includes(l.code))
    }
  }

  // 3. Handle Source specifically (Auto-Detect logic & Source Restrictions)
  if (type === 'source') {
    // If provider has restricted pairs, only show languages that can act as a source
    const restrictedMap = PROVIDER_LANGUAGE_PAIRS[provider]
    if (restrictedMap) {
      filtered = filtered.filter(l => !!restrictedMap[l.code])
    }

    return hasAutoDetect ? [{ code: 'auto', name: 'Auto-Detect' }, ...filtered] : filtered
  }

  // 4. Handle Target specifically (Pair-based filtering)
  const restrictedMap = PROVIDER_LANGUAGE_PAIRS[provider]
  if (restrictedMap) {
    const currentSource = sourceLanguage.value
    // If we have a restricted map and a specific source is selected, filter targets
    if (currentSource !== 'auto' && restrictedMap[currentSource]) {
      const allowedTargets = restrictedMap[currentSource]
      filtered = filtered.filter(l => allowedTargets.includes(l.code))
    } else if (currentSource === 'auto') {
      // If source is auto (and somehow allowed), show union of all possible targets
      const allPossibleTargets = new Set(Object.values(restrictedMap).flat())
      filtered = filtered.filter(l => allPossibleTargets.has(l.code))
    }
  }

  return filtered
}

const filteredSourceLanguages = computed(() => getFilteredLanguages('source'))
const filteredTargetLanguages = computed(() => getFilteredLanguages('target'))

const syncLanguagesWithProviderSupport = ({ clearInvalidTarget = false } = {}) => {
  const provider = selectedProvider.value
  const providerInfo = findProviderById(provider)
  const hasAutoDetect = providerInfo?.features?.includes('autoDetect')

  // 1. Correct Source Language
  if (sourceLanguage.value === 'auto' && !hasAutoDetect) {
    // Switch to first available source (e.g., 'fa' or 'en' for Vajehyab)
    sourceLanguage.value = filteredSourceLanguages.value[0]?.code || 'en'
  } else if (!filteredSourceLanguages.value.some(l => l.code === sourceLanguage.value)) {
    // If current source is not supported, default to first available
    sourceLanguage.value = hasAutoDetect ? 'auto' : (filteredSourceLanguages.value[0]?.code || 'en')
  }

  // 2. Correct Target Language based on Source
  if (!filteredTargetLanguages.value.some(l => l.code === targetLanguage.value)) {
    targetLanguage.value = clearInvalidTarget
      ? ''
      : (filteredTargetLanguages.value.find(l => l.code === 'fa' || l.code === 'en' || getCanonicalCode(l.code) === 'en')?.code || filteredTargetLanguages.value[0]?.code || 'en')
  }
}

watch([selectedProvider, sourceLanguage], () => {
  syncLanguagesWithProviderSupport()
})

watch(() => settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED, (isEnabled, previousValue) => {
  if (selectedProvider.value !== ProviderRegistryIds.DEEPL || previousValue === undefined || isEnabled === previousValue) {
    return
  }

  syncLanguagesWithProviderSupport({ clearInvalidTarget: true })
})

// --- Validation ---

const validationErrorKey = ref('')
const validationError = computed(() => {
  if (!validationErrorKey.value) return ''

  // 1. Check for provider configuration errors if that's the current error state
  if (validationErrorKey.value === 'PROVIDER_CONFIG_ERROR') {
    const missingKey = getFirstMissingSetting(selectedProvider.value, settingsStore.settings)
    if (missingKey) {
      return t('validation_api_key_empty', { provider: selectedProviderInfo.value?.name || selectedProvider.value }) || 'Provider not configured'
    }
    return ''
  }

  // 2. Otherwise show language validation errors (validationErrorKey holds the error key)
  return getFirstErrorTranslated('sourceLanguage', t) || getFirstErrorTranslated('targetLanguage', t) || ''
})

watch(validationError, (err) => {
  // Sync with global store state
  settingsStore.isSettingsValid = !err
}, { immediate: true })

const validateLanguages = async (showFeedback = false) => {
  clearErrors()
  
  // 1. Standard language validation
  const isValid = await validate(sourceLanguage.value, targetLanguage.value)
  if (!isValid) {
    if (showFeedback) {
      validationErrorKey.value = getFirstError('sourceLanguage') || getFirstError('targetLanguage') || ''
    }
    return false
  }

  // 2. Provider configuration validation
  const missingKey = getFirstMissingSetting(selectedProvider.value, settingsStore.settings);
  if (missingKey) {
    if (showFeedback) {
      validationErrorKey.value = 'PROVIDER_CONFIG_ERROR'
    }
    return false
  }

  // Clear error display if everything is valid
  validationErrorKey.value = ''
  return true
}

// Validation feedback listener
const handleValidationFeedback = (e) => {
  const { field } = e.detail || {};
  
  // Explicitly trigger validation feedback display
  validateLanguages(true);

  // Focus and highlight logic
  const missingKey = getFirstMissingSetting(selectedProvider.value, settingsStore.settings);
  if (field === missingKey || field === 'provider') {
    activeAccordion.value = 'api';
    setTimeout(() => {
      highlightElement(missingKey || 'TRANSLATION_API');
    }, 400);
  } else if (field === 'languages') {
    highlightElement('SOURCE_LANGUAGE');
  }
};

onMounted(() => {
  window.addEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onUnmounted(() => {
  window.removeEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onMounted(async () => { await loadLanguages(); await validateLanguages() })
defineExpose({ validate: validateLanguages })

</script>
