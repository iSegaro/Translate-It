<template>
  <div class="openai-settings">
    <h3>{{ t('openai_api_settings_title') || 'OpenAI API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('openai_api_key_info') || 'Get your OpenAI API key from' }}
      </span>
      <a
        class="api-link"
        href="https://platform.openai.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('openai_api_key_link') || 'Get OpenAI API Key' }}
      </a>
    </div>

    <ApiKeyInput
      id="OPENAI_API_KEY"
      v-model="openaiApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('openai_api_key_placeholder') || 'Enter your API keys (one per line)'"
      :provider-id="ProviderRegistryIds.OPENAI"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="openaiApiModel"
        :options="openaiApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
      <div
        class="model-discovery-status-live"
        :class="{ 'ti-sr-only': !savedModelNotAdvertised }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <small
          v-if="savedModelNotAdvertised"
          class="model-discovery-status"
        >{{ t('openai_model_not_listed') || 'Saved model was not listed by OpenAI.' }}</small>
      </div>
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('openai_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openaiCustomModel"
        :placeholder="t('openai_custom_model_placeholder') || 'Enter custom model name'"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <small class="model-discovery-status">
        {{ t('openai_catalog_compatibility_notice') || 'The model catalog does not indicate Chat Completions compatibility; listed models may not all support Chat Completions.' }}
      </small>
      <div
        class="model-discovery-status-live"
        :class="{ 'ti-sr-only': !catalogStatusVisible }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <small
          v-if="!hasOpenAIKey"
          class="model-discovery-status"
        >{{ t('openai_models_missing_key') || 'Add an API key to discover available models.' }}</small>
        <small
          v-else-if="modelDiscoveryLoading"
          class="model-discovery-status"
        >{{ t('openai_models_loading') || 'Loading model catalog…' }}</small>
        <small
          v-else-if="modelDiscoveryFailed"
          class="model-discovery-status"
        >{{ t('openai_models_discovery_failed') || 'Could not load OpenAI models.' }}</small>
        <small
          v-else-if="modelDiscoverySucceeded && discoveredModels.length === 0"
          class="model-discovery-status"
        >{{ t('openai_models_empty') || 'No models were returned by OpenAI.' }}</small>
      </div>
      <template v-if="modelDiscoverySucceeded && discoveredModels.length > 0">
        <ModelCatalogPicker
          v-model="catalogModelSelection"
          :models="discoveredModels"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import "./OpenAIApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ModelCatalogPicker from '@/components/feature/api-settings/ModelCatalogPicker.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { presentProviderSettingsError } from '@/features/settings/presentation/ProviderSettingsErrorPresenter.js'
import {
  fetchOpenAIModels,
  getCachedOpenAIModels,
  MissingOpenAIKeyError,
} from '@/features/translation/providers/OpenAIModelDiscovery.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const openaiApiKey = computed({
  get: () => settingsStore.settings?.OPENAI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENAI_API_KEY', value)
})

const selectedModelOption = ref(CONFIG.OPENAI_API_MODEL)
const discoveredModels = ref([])
const modelDiscoveryLoading = ref(false)
const modelDiscoveryFailed = ref(false)
const modelDiscoverySucceeded = ref(false)
const customModelVisible = ref(false)
const hasOpenAIKey = computed(() => ApiKeyManager.parseKeys(openaiApiKey.value).length > 0)
let discoveryRequestId = 0
let discoveryTimer
let activeController
let selectionInteraction = 0

const openaiApiModelOptions = computed(() => {
  const curated = (CONFIG.OPENAI_MODELS || []).filter(model => model.value !== 'custom')
  const options = curated.map(model => ({ value: model.value, label: model.name || model.value }))
  const savedModel = settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
  const catalogModel = discoveredModels.value.find(model => model.value === savedModel)
  if (savedModel && savedModel !== 'custom' && !options.some(option => option.value === savedModel)) {
    options.push({
      value: savedModel,
      label: catalogModel ? catalogModel.name : `${savedModel} — ${t('openai_saved_model_label') || 'Saved model'}`,
      legacy: !catalogModel,
    })
  }
  const custom = (CONFIG.OPENAI_MODELS || []).find(model => model.value === 'custom')
  options.push({ value: 'custom', label: custom?.name || 'Custom Model' })
  return options
})

const savedModelNotAdvertised = computed(() => {
  const savedModel = settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
  return modelDiscoverySucceeded.value
    && Boolean(savedModel)
    && savedModel !== 'custom'
    && !discoveredModels.value.some(model => model.value === savedModel)
})

// Persistent live region is only placed in flow while it carries a message.
const catalogStatusVisible = computed(() => !hasOpenAIKey.value
  || modelDiscoveryLoading.value
  || modelDiscoveryFailed.value
  || (modelDiscoverySucceeded.value && discoveredModels.value.length === 0))

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL;
  const isPredefined = (CONFIG.OPENAI_MODELS || []).some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
  customModelVisible.value = !isPredefined
}

const syncSavedSelection = (requestId, key, selectionAtStart) => {
  if (requestId !== discoveryRequestId
    || key !== openaiApiKey.value
    || selectionAtStart !== selectionInteraction
    || selectedModelOption.value !== 'custom') return
  const savedModel = settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
  const isPredefined = (CONFIG.OPENAI_MODELS || []).some(model => model.value === savedModel && model.value !== 'custom')
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
  const cached = getCachedOpenAIModels(key)
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
    const models = await fetchOpenAIModels({ apiKey: key, signal: controller.signal })
    if (requestId !== discoveryRequestId || key !== openaiApiKey.value) return
    discoveredModels.value = models
    modelDiscoverySucceeded.value = true
    modelDiscoveryFailed.value = false
    syncSavedSelection(requestId, key, selectionAtStart)
  } catch (error) {
    if (requestId !== discoveryRequestId || key !== openaiApiKey.value) return
    if (error instanceof MissingOpenAIKeyError) {
      modelDiscoveryFailed.value = false
      modelDiscoverySucceeded.value = false
      return
    }
    modelDiscoverySucceeded.value = false
    modelDiscoveryFailed.value = true
  } finally {
    if (requestId === discoveryRequestId && key === openaiApiKey.value) modelDiscoveryLoading.value = false
  }
}

const catalogModelSelection = computed({
  get: () => {
    return settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
  },
  set: (value) => {
    if (!value) return
    selectionInteraction++
    selectedModelOption.value = value
    customModelVisible.value = false
    settingsStore.updateSettingLocally('OPENAI_API_MODEL', value)
    settingsStore.updateSettingLocally('OPENAI_MODEL_SOURCE', 'catalog')
  }
})

watch(openaiApiKey, (apiKey) => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
  discoveredModels.value = []
  modelDiscoverySucceeded.value = false
  modelDiscoveryFailed.value = false
  const requestId = ++discoveryRequestId
  const scheduledSelection = selectionInteraction
  if (!ApiKeyManager.parseKeys(apiKey).length) {
    modelDiscoveryLoading.value = false
    return
  }
  modelDiscoveryLoading.value = true
  discoveryTimer = setTimeout(() => {
    if (requestId === discoveryRequestId) discoverModels(apiKey, scheduledSelection)
  }, 400)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
})

const openaiApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectionInteraction++
    const wasCustom = selectedModelOption.value === 'custom'
    customModelVisible.value = value === 'custom' && wasCustom ? customModelVisible.value : false
    // Capture before either setting is modified: the write-through store would
    // otherwise make the "previous" model indistinguishable from the new value.
    const previousModel = settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
    const previousSource = settingsStore.settings?.OPENAI_MODEL_SOURCE || CONFIG.OPENAI_MODEL_SOURCE
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('OPENAI_API_MODEL', value)
    }
    const isCurated = (CONFIG.OPENAI_MODELS || []).some(model => model.value === value && model.value !== 'custom')
    const isCatalog = discoveredModels.value.some(model => model.value === value)
    // Reselecting the already-saved model must not demote explicit catalog/custom
    // provenance when discovery is unavailable; genuinely new IDs still resolve below.
    const isReselectedSaved = value !== 'custom' && value === previousModel
      && (previousSource === 'catalog' || previousSource === 'custom')
    settingsStore.updateSettingLocally('OPENAI_MODEL_SOURCE', value === 'custom' ? 'custom' : isCurated ? 'curated' : isCatalog ? 'catalog' : isReselectedSaved ? previousSource : 'legacy')
    // If 'custom' is selected, wait for user input in custom field
  }
})

const openaiCustomModel = computed({
  get: () => selectedModelOption.value === 'custom' && customModelVisible.value
    ? settingsStore.settings?.OPENAI_API_MODEL || CONFIG.OPENAI_API_MODEL
    : '',
  set: (value) => {
    selectionInteraction++
    customModelVisible.value = true
    settingsStore.updateSettingLocally('OPENAI_API_MODEL', value);
    settingsStore.updateSettingLocally('OPENAI_MODEL_SOURCE', 'custom')
  }
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerId) => {
  if (!openaiApiKey.value.trim()) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      openaiApiKey.value, 
      providerId,
      {
        apiModel: openaiApiModel.value === 'custom' ? openaiCustomModel.value : openaiApiModel.value
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
      settingsStore.updateSettingLocally('OPENAI_API_KEY', result.reorderedString)
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
  discoverModels(openaiApiKey.value)
})
</script>
