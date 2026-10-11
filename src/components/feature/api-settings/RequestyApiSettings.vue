<template>
  <div class="requesty-settings">
    <h3>{{ t('requesty_api_settings_title') || 'Requesty API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <p class="setting-description">
        {{ t('requesty_api_key_info') || 'Get your Requesty API key from' }}
      </p>
      <a
        class="api-link"
        href="https://app.requesty.ai/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('requesty_api_key_link') || 'Get Requesty API Key' }}
      </a>
    </div>
    <ApiKeyInput
      id="REQUESTY_API_KEY"
      v-model="requestyApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('requesty_api_key_placeholder') || 'Enter your API keys (one per line)'"
      :provider-id="ProviderRegistryIds.REQUESTY"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="requestyApiModel"
        :options="requestyApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
      <small
        v-if="savedModelNotAdvertised"
        class="model-discovery-status"
      >{{ t('requesty_model_not_listed') || 'Saved model was not listed by Requesty.' }}</small>
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('requesty_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="requestyCustomModel"
        :placeholder="t('requesty_custom_model_placeholder') || 'Enter custom model name (e.g., provider/model-name)'"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <BaseInput
        id="requesty-model-search"
        v-model="searchQuery"
        type="search"
        :label="t('requesty_catalog_search_label') || 'Search Requesty models'"
        :placeholder="t('requesty_catalog_search_placeholder') || 'Search by model ID or name'"
        dir="ltr"
      />
      <small
        v-if="modelDiscoveryLoading"
        class="model-discovery-status"
      >{{ t('requesty_models_loading') || 'Loading model catalog…' }}</small>
      <small
        v-else-if="modelDiscoveryFailed"
        class="model-discovery-status"
      >{{ t('requesty_models_discovery_failed') || 'Could not load Requesty models.' }}</small>
      <small
        v-else-if="modelDiscoverySucceeded && discoveredModels.length === 0"
        class="model-discovery-status"
      >{{ t('requesty_models_empty') || 'No models were returned by Requesty.' }}</small>
      <template v-else-if="modelDiscoverySucceeded">
        <BaseSelect
          v-model="catalogModelSelection"
          :options="filteredCatalog.options"
          :style="rtlSelectStyle"
          :aria-label="t('requesty_catalog_results_label') || 'Available Requesty models'"
        />
        <small
          v-if="filteredCatalog.total > filteredCatalog.options.length"
          class="model-discovery-status"
        >{{ t('requesty_catalog_showing_count', { shown: filteredCatalog.options.length, total: filteredCatalog.total }) || `Showing ${filteredCatalog.options.length} of ${filteredCatalog.total} matching models` }}</small>
        <small
          v-if="discoveredModels.length > 0 && filteredCatalog.total === 0"
          class="model-discovery-status"
        >{{ t('requesty_catalog_no_matches') || 'No models match your search.' }}</small>
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import "./RequestyApiSettings.scss"
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
  fetchRequestyModels,
  getCachedRequestyModels,
} from '@/features/translation/providers/RequestyModelDiscovery.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const requestyApiKey = computed({
  get: () => settingsStore.settings?.REQUESTY_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('REQUESTY_API_KEY', value)
})

const selectedModelOption = ref(CONFIG.REQUESTY_API_MODEL)
const discoveredModels = ref([])
const modelDiscoveryLoading = ref(false)
const modelDiscoveryFailed = ref(false)
const modelDiscoverySucceeded = ref(false)
const searchQuery = ref('')
const customModelVisible = ref(false)
let discoveryRequestId = 0
let discoveryTimer
let activeController
let selectionInteraction = 0

const requestyApiModelOptions = computed(() => {
  const curated = (CONFIG.REQUESTY_MODELS || []).filter(model => model.value !== 'custom')
  const options = curated.map(model => ({ value: model.value, label: model.name || model.value }))
  const savedModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL
  const catalogModel = discoveredModels.value.find(model => model.value === savedModel)
  if (savedModel && savedModel !== 'custom' && !options.some(option => option.value === savedModel)) {
    options.push({
      value: savedModel,
      label: catalogModel ? catalogModel.name : `${savedModel} — ${t('requesty_saved_model_label') || 'Saved model'}`,
      legacy: !catalogModel,
    })
  }
  const custom = (CONFIG.REQUESTY_MODELS || []).find(model => model.value === 'custom')
  options.push({ value: 'custom', label: custom?.name || 'Custom Model' })
  return options
})

const filteredCatalog = computed(() => filterModelCatalog(discoveredModels.value, searchQuery.value))

const savedModelNotAdvertised = computed(() => {
  const savedModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL
  return modelDiscoverySucceeded.value
    && Boolean(savedModel)
    && savedModel !== 'custom'
    && !discoveredModels.value.some(model => model.value === savedModel)
})

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL;
  const isPredefined = (CONFIG.REQUESTY_MODELS || []).some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
  customModelVisible.value = !isPredefined
}

const syncSavedSelection = (requestId, key, selectionAtStart) => {
  if (requestId !== discoveryRequestId
    || key !== requestyApiKey.value
    || selectionAtStart !== selectionInteraction
    || selectedModelOption.value !== 'custom') return
  const savedModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL
  const isPredefined = (CONFIG.REQUESTY_MODELS || []).some(model => model.value === savedModel && model.value !== 'custom')
    || discoveredModels.value.some(model => model.value === savedModel)
  if (isPredefined) {
    selectedModelOption.value = savedModel
    customModelVisible.value = false
  }
}

const discoverModels = async (apiKey) => {
  const requestId = ++discoveryRequestId
  const key = typeof apiKey === 'string' ? apiKey : ''
  const selectionAtStart = selectionInteraction
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  modelDiscoveryFailed.value = false
  const cached = getCachedRequestyModels(key)
  if (cached !== null) {
    discoveredModels.value = cached
    modelDiscoverySucceeded.value = true
    modelDiscoveryLoading.value = false
    syncSavedSelection(requestId, key, selectionAtStart)
    return
  }
  modelDiscoveryLoading.value = true
  try {
    const models = await fetchRequestyModels({ apiKey: key, signal: controller.signal })
    if (requestId !== discoveryRequestId || key !== requestyApiKey.value) return
    discoveredModels.value = models
    modelDiscoverySucceeded.value = true
    modelDiscoveryFailed.value = false
    syncSavedSelection(requestId, key, selectionAtStart)
  } catch {
    if (requestId !== discoveryRequestId || key !== requestyApiKey.value) return
    modelDiscoverySucceeded.value = false
    modelDiscoveryFailed.value = true
  } finally {
    if (requestId === discoveryRequestId && key === requestyApiKey.value) modelDiscoveryLoading.value = false
  }
}

const catalogModelSelection = computed({
  get: () => {
    const savedModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL
    return filteredCatalog.value.options.some(option => option.value === savedModel) ? savedModel : ''
  },
  set: (value) => {
    if (!value) return
    selectionInteraction++
    selectedModelOption.value = value
    customModelVisible.value = false
    settingsStore.updateSettingLocally('REQUESTY_API_MODEL', value)
  }
})

watch(requestyApiKey, (apiKey) => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
  discoveredModels.value = []
  modelDiscoverySucceeded.value = false
  modelDiscoveryFailed.value = false
  modelDiscoveryLoading.value = false
  const requestId = ++discoveryRequestId
  discoveryTimer = setTimeout(() => {
    if (requestId === discoveryRequestId) discoverModels(apiKey)
  }, 400)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
})

const requestyApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectionInteraction++
    const wasCustom = selectedModelOption.value === 'custom'
    customModelVisible.value = value === 'custom' && wasCustom ? customModelVisible.value : false
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('REQUESTY_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const requestyCustomModel = computed({
  get: () => selectedModelOption.value === 'custom' && customModelVisible.value
    ? settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL
    : '',
  set: (value) => {
    selectionInteraction++
    customModelVisible.value = true
    settingsStore.updateSettingLocally('REQUESTY_API_MODEL', value);
  }
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerId) => {
  if (!requestyApiKey.value.trim()) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      requestyApiKey.value, 
      providerId,
      {
        apiModel: requestyApiModel.value === 'custom' ? requestyCustomModel.value : requestyApiModel.value
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
      settingsStore.updateSettingLocally('REQUESTY_API_KEY', result.reorderedString)
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
  discoverModels(requestyApiKey.value)
})
</script>
