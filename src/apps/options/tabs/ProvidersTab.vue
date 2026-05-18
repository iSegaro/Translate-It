<template>
  <section class="options-tab-content providers-tab">
    <div class="settings-container">
      <h2>{{ t('providers_tab_title') || 'Service Settings' }}</h2>

      <!-- Service Selection -->
      <div class="setting-group primary-service-selection">
        <label>{{ t('translation_api_label') || 'Primary Service' }}</label>
        <div class="selector-wrapper">
          <ProviderSelector 
            v-model="selectedProvider" 
            mode="button"
            :is-global="false"
            ignore-hidden
          />
        </div>
      </div>

      <div class="api-settings-section">
        <div class="provider-settings-container">
          <Transition 
            name="fade-slide" 
            mode="out-in"
          >
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
                <h3>{{ t(selectedProviderInfo.titleKey) || selectedProviderInfo.displayName }}</h3>
                <p class="setting-description">
                  {{ t(selectedProviderInfo.descriptionKey) }}
                </p>
              </div>

              <component :is="providerSettingsComponent" />

              <div 
                id="HIDDEN_PROVIDERS_CHECKBOX" 
                class="setting-group vertical provider-visibility-group"
              >
                <BaseCheckbox
                  v-model="showInList"
                  :label="t('show_provider_in_list_label') || 'Show in provider list'"
                />
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import './ProvidersTab.scss'
import { ref, onMounted, onUnmounted, computed, defineAsyncComponent, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { findProviderById, getProviderManifest } from '@/features/translation/providers/ProviderManifest.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { getFirstMissingSetting } from '@/features/translation/utils/providerValidator.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useHighlightManager } from '../composables/useHighlightManager.js'
import { useProviderVisibility } from '../composables/useProviderVisibility.js'

// Components
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ProvidersTab')
const settingsStore = useSettingsStore()
const route = useRoute()
const { t } = useUnifiedI18n()
const { checkAndHighlight, highlightElement } = useHighlightManager()
const { createSetting } = useTabSettings(settingsStore, logger)

// Local selection (does NOT update global TRANSLATION_API)
const selectedProvider = ref(settingsStore.settings?.TRANSLATION_API || ProviderRegistryIds.GOOGLE_V2)

// Auto-highlight missing settings when provider is changed manually
watch(selectedProvider, (newProvider) => {
  logger.debug(`[ProvidersTab] Local provider changed to ${newProvider}`);
  const missingKey = getFirstMissingSetting(newProvider, settingsStore.settings);
  if (missingKey) {
    setTimeout(() => {
      highlightElement(missingKey);
    }, 400);
  }
})

// Global reveal listener for highlighting
onMounted(async () => {
  // Detect provider from highlight parameter if it exists
  const highlightKey = route.query.highlight;
  if (highlightKey) {
    const provider = getProviderManifest().find(p => p.requiredSettings?.includes(highlightKey));
    if (provider) {
      selectedProvider.value = provider.id;
    }
  }

  // Handle highlighting logic
  setTimeout(async () => {
    await checkAndHighlight();
  }, 100);
})

// Provider Visibility logic
const { showInList } = useProviderVisibility(selectedProvider)

const currentOptimizationLevel = computed({
  get: () => settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS?.[selectedProvider.value] || settingsStore.settings?.OPTIMIZATION_LEVEL || 3,
  set: (val) => {
    const providerLevels = { ...(settingsStore.settings?.PROVIDER_OPTIMIZATION_LEVELS || {}) }
    providerLevels[selectedProvider.value] = val
    settingsStore.updateSettingLocally('PROVIDER_OPTIMIZATION_LEVELS', providerLevels)
  }
})

const isAIProvider = computed(() => ['gemini', 'openai', 'openrouter', 'deepseek', 'webai', 'custom'].includes(selectedProvider.value))
const isAutoLanguageProvider = computed(() => selectedProviderInfo.value?.features?.includes('autoLanguage'))
const selectedProviderInfo = computed(() => findProviderById(selectedProvider.value))
const providerSettingsComponent = computed(() => {
  const p = selectedProvider.value
  const map = { gemini: 'Gemini', deepl: 'DeepL', browser: 'Browser', webai: 'WebAI', lingva: 'Lingva', openai: 'OpenAI', openrouter: 'OpenRouter', deepseek: 'Deepseek', custom: 'Custom' }
  return map[p] ? defineAsyncComponent(() => import(`@/components/feature/api-settings/${map[p]}ApiSettings.vue`)) : null
})

// Validation feedback listener
const handleValidationFeedback = (e) => {
  const { field } = e.detail || {};
  
  if (field === 'provider' || (field && field.includes('API'))) {
    setTimeout(() => {
      highlightElement(field || 'TRANSLATION_API');
    }, 400);
  }
};

onMounted(() => {
  window.addEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})

onUnmounted(() => {
  window.removeEventListener('options-trigger-validation-feedback', handleValidationFeedback);
})
</script>
