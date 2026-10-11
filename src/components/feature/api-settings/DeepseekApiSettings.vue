<template>
  <div class="deepseek-settings">
    <h3>{{ t('deepseek_api_settings_title') || 'DeepSeek API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <p class="setting-description">
        {{ t('deepseek_api_key_info') || 'Get your DeepSeek API key from' }}
      </p>
      <a
        class="api-link"
        href="https://platform.deepseek.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('deepseek_api_key_link') || 'Get DeepSeek API Key' }}
      </a>
    </div>
    <ApiKeyInput
      id="DEEPSEEK_API_KEY"
      v-model="deepseekApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('deepseek_api_key_placeholder') || 'Enter your API keys (one per line)'"
      :provider-id="ProviderRegistryIds.DEEPSEEK"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="deepseekApiModel"
        :options="deepseekApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
      <small
        class="model-discovery-status model-discovery-status-warning"
        :class="{ 'model-discovery-status--absent': !savedModelWarningMessage }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >{{ savedModelWarningMessage }}</small>
    </div>
    <div
      v-if="showDeepseekThinkingMode"
      class="setting-group vertical"
    >
      <label for="deepseek-thinking-mode">
        {{ t('deepseek_thinking_mode_label') || 'Thinking Mode' }}
      </label>
      <BaseSelect
        id="deepseek-thinking-mode"
        v-model="deepseekThinkingMode"
        :options="deepseekThinkingModeOptions"
        class="thinking-mode-select"
        :style="rtlSelectStyle"
        aria-describedby="deepseek-thinking-mode-description"
      />
      <p
        id="deepseek-thinking-mode-description"
        class="setting-description"
      >
        {{ t('deepseek_thinking_mode_description') || 'Controls how much reasoning DeepSeek uses. This setting does not change the selected model.' }}
      </p>
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('deepseek_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="deepseekCustomModel"
        :placeholder="t('deepseek_custom_model_placeholder') || 'Enter custom model name'"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <!-- Catalog discovery provides IDs only; Thinking eligibility remains exclusively driven by CONFIG.DEEPSEEK_MODELS.supportsThinking. -->
      <BaseInput
        id="deepseek-model-search"
        v-model="searchQuery"
        type="search"
        :label="t('deepseek_catalog_search_label') || 'Search DeepSeek models'"
        :placeholder="t('deepseek_catalog_search_placeholder') || 'Search by model ID or name'"
        dir="ltr"
      />
      <small
        class="model-discovery-status model-discovery-status-live"
        :class="{ 'model-discovery-status--absent': !discoveryStatusMessage }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >{{ discoveryStatusMessage }}</small>
      <template v-if="modelDiscoverySucceeded && discoveredModels.length > 0">
        <BaseSelect
          v-model="catalogModelSelection"
          :options="filteredCatalog.options"
          class="catalog-model-select"
          :style="rtlSelectStyle"
          :aria-label="t('deepseek_catalog_results_label') || 'Available DeepSeek models'"
        />
        <small
          v-if="filteredCatalog.total > filteredCatalog.options.length"
          class="model-discovery-status"
        >{{ t('deepseek_catalog_showing_count', { shown: filteredCatalog.options.length, total: filteredCatalog.total }) || `Showing ${filteredCatalog.options.length} of ${filteredCatalog.total} matching models` }}</small>
        <small
          v-if="discoveredModels.length > 0 && filteredCatalog.total === 0"
          class="model-discovery-status"
        >{{ t('deepseek_catalog_no_matches') || 'No models match your search.' }}</small>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import "./DeepseekApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { presentProviderSettingsError } from '@/features/settings/presentation/ProviderSettingsErrorPresenter.js'
import { filterModelCatalog } from '@/features/settings/presentation/modelCatalogFilter.js'
import {
  fetchDeepSeekModels,
  getCachedDeepSeekModels,
  MissingDeepSeekKeyError,
} from '@/features/translation/providers/DeepSeekModelDiscovery.js'
import { isOfficialDeepSeekEndpoint } from '@/features/translation/providers/modelDiscoveryEndpoints.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const deepseekApiKey = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', value)
})

const selectedModelOption = ref(CONFIG.DEEPSEEK_API_MODEL)
const discoveredModels = ref([])
const modelDiscoveryLoading = ref(false)
const modelDiscoveryFailed = ref(false)
const modelDiscoverySucceeded = ref(false)
const searchQuery = ref('')
const customModelVisible = ref(false)
const hasDeepSeekKey = computed(() => ApiKeyManager.parseKeys(deepseekApiKey.value).length > 0)
// Discovery must never contact api.deepseek.com for a custom endpoint. The URL
// input is not rendered here, but a stored override still governs translation.
const deepseekApiUrl = computed(() => settingsStore.settings?.DEEPSEEK_API_URL || CONFIG.DEEPSEEK_API_URL)
const usesOfficialDeepSeekEndpoint = computed(() => isOfficialDeepSeekEndpoint(deepseekApiUrl.value))
let discoveryRequestId = 0
let discoveryTimer
let activeController
let selectionInteraction = 0

const deepseekApiModelOptions = computed(() => {
  const curated = (CONFIG.DEEPSEEK_MODELS || []).filter(model => model.value !== 'custom')
  const options = curated.map(model => ({ value: model.value, label: model.name || model.value }))
  const savedModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
  const catalogModel = discoveredModels.value.find(model => model.value === savedModel)
  if (savedModel && savedModel !== 'custom' && !options.some(option => option.value === savedModel)) {
    options.push({
      value: savedModel,
      label: catalogModel ? catalogModel.name : `${savedModel} — ${t('deepseek_saved_model_label') || 'Saved model'}`,
      legacy: !catalogModel,
    })
  }
  const custom = (CONFIG.DEEPSEEK_MODELS || []).find(model => model.value === 'custom')
  options.push({ value: 'custom', label: custom?.name || 'Custom Model' })
  return options
})

const filteredCatalog = computed(() => filterModelCatalog(discoveredModels.value, searchQuery.value))

const savedModelNotAdvertised = computed(() => {
  const savedModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
  return modelDiscoverySucceeded.value
    && Boolean(savedModel)
    && savedModel !== 'custom'
    && !discoveredModels.value.some(model => model.value === savedModel)
})

// Persistent live-region copy: the DOM element stays mounted and only this
// resolved message changes, so screen readers announce real transitions instead
// of conditional mounts.
const savedModelWarningMessage = computed(() => (
  savedModelNotAdvertised.value
    ? (t('deepseek_model_not_listed') || 'Saved model was not listed by DeepSeek.')
    : ''
))

const discoveryStatusMessage = computed(() => {
  if (!usesOfficialDeepSeekEndpoint.value) {
    return t('deepseek_custom_endpoint_info') || 'Using a custom API URL — DeepSeek\'s model catalog is not loaded.'
  }
  if (!hasDeepSeekKey.value) {
    return t('deepseek_models_missing_key') || 'Add an API key to discover available models.'
  }
  if (modelDiscoveryLoading.value) {
    return t('deepseek_models_loading') || 'Loading model catalog…'
  }
  if (modelDiscoveryFailed.value) {
    return t('deepseek_models_discovery_failed') || 'Could not load DeepSeek models.'
  }
  if (modelDiscoverySucceeded.value && discoveredModels.value.length === 0) {
    return t('deepseek_models_empty') || 'No models were returned by DeepSeek.'
  }
  return ''
})

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL;
  const isPredefined = (CONFIG.DEEPSEEK_MODELS || []).some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
  customModelVisible.value = !isPredefined
}

const syncSavedSelection = (requestId, key, selectionAtStart) => {
  if (requestId !== discoveryRequestId
    || key !== deepseekApiKey.value
    || selectionAtStart !== selectionInteraction
    || selectedModelOption.value !== 'custom') return
  const savedModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
  const isPredefined = (CONFIG.DEEPSEEK_MODELS || []).some(model => model.value === savedModel && model.value !== 'custom')
    || discoveredModels.value.some(model => model.value === savedModel)
  if (isPredefined) {
    selectedModelOption.value = savedModel
    customModelVisible.value = false
  }
}

const discoverModels = async (apiKey, selectionAtStart = selectionInteraction) => {
  const requestId = ++discoveryRequestId
  const key = typeof apiKey === 'string' ? apiKey : ''
  activeController?.abort()
  activeController = null
  if (!ApiKeyManager.parseKeys(key).length) {
    discoveredModels.value = []
    modelDiscoveryLoading.value = false
    modelDiscoveryFailed.value = false
    modelDiscoverySucceeded.value = false
    return
  }
  // Guard before the cache getter: a warm official cache must never leak into a
  // custom-endpoint configuration, and the official host must not be contacted.
  if (!usesOfficialDeepSeekEndpoint.value) {
    discoveredModels.value = []
    modelDiscoveryLoading.value = false
    modelDiscoveryFailed.value = false
    modelDiscoverySucceeded.value = false
    return
  }
  const cached = getCachedDeepSeekModels(key)
  modelDiscoveryFailed.value = false
  if (cached !== null) {
    discoveredModels.value = cached
    modelDiscoverySucceeded.value = true
    modelDiscoveryLoading.value = false
    syncSavedSelection(requestId, key, selectionAtStart)
    return
  }
  const controller = new AbortController()
  activeController = controller
  modelDiscoveryLoading.value = true
  try {
    const models = await fetchDeepSeekModels({ apiKey: key, signal: controller.signal })
    if (requestId !== discoveryRequestId || key !== deepseekApiKey.value || !usesOfficialDeepSeekEndpoint.value) return
    discoveredModels.value = models
    modelDiscoverySucceeded.value = true
    modelDiscoveryFailed.value = false
    syncSavedSelection(requestId, key, selectionAtStart)
  } catch (error) {
    if (requestId !== discoveryRequestId || key !== deepseekApiKey.value || !usesOfficialDeepSeekEndpoint.value) return
    if (error instanceof MissingDeepSeekKeyError) {
      modelDiscoverySucceeded.value = false
      modelDiscoveryFailed.value = false
      return
    }
    modelDiscoverySucceeded.value = false
    modelDiscoveryFailed.value = true
  } finally {
    if (requestId === discoveryRequestId && key === deepseekApiKey.value) modelDiscoveryLoading.value = false
  }
}

const catalogModelSelection = computed({
  get: () => {
    const savedModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
    return filteredCatalog.value.options.some(option => option.value === savedModel) ? savedModel : ''
  },
  set: (value) => {
    if (!value) return
    selectionInteraction++
    selectedModelOption.value = value
    customModelVisible.value = false
    settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value)
    settingsStore.updateSettingLocally('DEEPSEEK_MODEL_SOURCE', 'catalog')
  }
})

const scheduleDiscovery = (apiKey) => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
  discoveredModels.value = []
  modelDiscoverySucceeded.value = false
  modelDiscoveryFailed.value = false
  const requestId = ++discoveryRequestId
  const scheduledSelection = selectionInteraction
  if (!ApiKeyManager.parseKeys(apiKey).length || !usesOfficialDeepSeekEndpoint.value) {
    modelDiscoveryLoading.value = false
    return
  }
  modelDiscoveryLoading.value = true
  discoveryTimer = setTimeout(() => {
    if (requestId === discoveryRequestId) discoverModels(apiKey, scheduledSelection)
  }, 400)
}

watch(deepseekApiKey, (apiKey) => {
  scheduleDiscovery(apiKey)
}, { flush: 'sync' })

watch(deepseekApiUrl, () => {
  scheduleDiscovery(deepseekApiKey.value)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
})

const deepseekApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectionInteraction++
    const wasCustom = selectedModelOption.value === 'custom'
    customModelVisible.value = value === 'custom' && wasCustom ? customModelVisible.value : false
    // Capture before either setting is modified: the write-through store would
    // otherwise make the "previous" model indistinguishable from the new value.
    const previousModel = settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
    const previousSource = settingsStore.settings?.DEEPSEEK_MODEL_SOURCE || CONFIG.DEEPSEEK_MODEL_SOURCE
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value)
    }
    const isCurated = (CONFIG.DEEPSEEK_MODELS || []).some(model => model.value === value && model.value !== 'custom')
    const isCatalog = discoveredModels.value.some(model => model.value === value)
    // Reselecting the already-saved model must not demote explicit catalog/custom
    // provenance when discovery is unavailable; genuinely new IDs still resolve below.
    const isReselectedSaved = value !== 'custom' && value === previousModel
      && (previousSource === 'catalog' || previousSource === 'custom')
    settingsStore.updateSettingLocally('DEEPSEEK_MODEL_SOURCE', value === 'custom' ? 'custom' : isCurated ? 'curated' : isCatalog ? 'catalog' : isReselectedSaved ? previousSource : 'legacy')
    // If 'custom' is selected, wait for user input in custom field
  }
})

const deepseekCustomModel = computed({
  get: () => selectedModelOption.value === 'custom' && customModelVisible.value
    ? settingsStore.settings?.DEEPSEEK_API_MODEL || CONFIG.DEEPSEEK_API_MODEL
    : '',
  set: (value) => {
    selectionInteraction++
    customModelVisible.value = true
    settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value);
    settingsStore.updateSettingLocally('DEEPSEEK_MODEL_SOURCE', 'custom')
  }
})

const deepseekThinkingMode = computed({
  get: () => settingsStore.settings?.DEEPSEEK_THINKING_MODE || 'disabled',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_THINKING_MODE', value)
})

const deepseekThinkingModeOptions = computed(() =>
  CONFIG.DEEPSEEK_THINKING_MODE_OPTIONS.map(option => ({
    value: option.value,
    label: t(`deepseek_thinking_mode_${option.value}`) || option.name
  }))
)

const showDeepseekThinkingMode = computed(() =>
  CONFIG.DEEPSEEK_MODELS.find(({ value }) => value === selectedModelOption.value)?.supportsThinking === true
)

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerId) => {
  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      deepseekApiKey.value, 
      providerId,
      {
        apiModel: deepseekApiModel.value === 'custom' ? deepseekCustomModel.value : deepseekApiModel.value
      }
    )

    // Store messageKey and params for reactive translation in ApiKeyInput
    testResult.value = {
      allInvalid: result.allInvalid,
      messageKey: result.messageKey,
      params: result.params,
      reorderedString: result.reorderedString
    }

    // Update the local value with the reordered keys
    if (!result.allInvalid && result.reorderedString) {
      settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', result.reorderedString)
    }
  } catch (error) {
    testResult.value = {
      allInvalid: true,
      ...presentProviderSettingsError(error)
    }
  } finally {
    testingKeys.value = false
  }
}

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
  discoverModels(deepseekApiKey.value)
})
</script>

<style scoped>
/* Empty persistent live regions stay mounted (a11y tree) but leave no layout gap. */
.model-discovery-status--absent {
  position: absolute;
}
</style>
