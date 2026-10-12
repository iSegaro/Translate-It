<template>
  <div class="openrouter-settings">
    <h3>{{ t('openrouter_api_settings_title') || 'OpenRouter API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <p class="setting-description">
        {{ t('openrouter_api_key_info') || 'Get your OpenRouter API key from' }}
      </p>
      <a
        class="api-link"
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('openrouter_api_key_link') || 'Get OpenRouter API Key' }}
      </a>
    </div>
    <ApiKeyInput
      id="OPENROUTER_API_KEY"
      v-model="openrouterApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('openrouter_api_key_placeholder') || 'Enter your API keys (one per line)'"
      :provider-id="ProviderRegistryIds.OPENROUTER"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="openrouterApiModel"
        :options="openrouterApiModelOptions"
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
        >{{ t('openrouter_model_not_listed') || 'Saved model was not listed by OpenRouter.' }}</small>
      </div>
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('openrouter_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openrouterCustomModel"
        :placeholder="t('openrouter_custom_model_placeholder') || 'Enter custom model name (e.g., provider/model-name)'"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <div
        class="model-discovery-status-live"
        :class="{ 'ti-sr-only': !catalogStatusVisible }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <small
          v-if="modelDiscoveryLoading"
          class="model-discovery-status"
        >{{ t('openrouter_models_loading') || 'Loading model catalog…' }}</small>
        <small
          v-else-if="modelDiscoveryFailed"
          class="model-discovery-status"
        >{{ t('openrouter_models_discovery_failed') || 'Could not load OpenRouter models.' }}</small>
        <small
          v-else-if="modelDiscoverySucceeded && discoveredModels.length === 0"
          class="model-discovery-status"
        >{{ t('openrouter_models_empty') || 'No models were returned by OpenRouter.' }}</small>
      </div>
      <template v-if="modelDiscoverySucceeded && discoveredModels.length > 0">
        <ModelCatalogPicker
          v-model="catalogModelSelection"
          :models="discoveredModels"
          show-pricing
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onBeforeUnmount, onMounted, watch } from 'vue'
import "./OpenRouterApiSettings.scss"
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
  fetchOpenRouterModels,
  getCachedOpenRouterModels,
} from '@/features/translation/providers/OpenRouterModelDiscovery.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const openrouterApiKey = computed({
  get: () => settingsStore.settings?.OPENROUTER_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENROUTER_API_KEY', value)
})

const selectedModelOption = ref(CONFIG.OPENROUTER_API_MODEL)
const discoveredModels = ref([])
const modelDiscoveryLoading = ref(false)
const modelDiscoveryFailed = ref(false)
const modelDiscoverySucceeded = ref(false)
const customModelVisible = ref(false)
let discoveryRequestId = 0
let discoveryTimer
let activeController

const openrouterApiModelOptions = computed(() => {
  const curated = (CONFIG.OPENROUTER_MODELS || []).filter(model => model.value !== 'custom')
  const options = curated.map(model => ({ value: model.value, label: model.name || model.value }))
  const savedModel = settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL
  const catalogModel = discoveredModels.value.find(model => model.value === savedModel)
  if (savedModel && savedModel !== 'custom' && !options.some(option => option.value === savedModel)) {
    const label = catalogModel
      ? catalogModel.name
      : `${savedModel} — ${t('openrouter_saved_model_label') || 'Saved model'}`
    options.push({ value: savedModel, label, legacy: !catalogModel })
  }
  const custom = (CONFIG.OPENROUTER_MODELS || []).find(model => model.value === 'custom')
  options.push({ value: 'custom', label: custom?.name || 'Custom Model' })
  return options
})

const savedModelNotAdvertised = computed(() => {
  const savedModel = settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL
  return modelDiscoverySucceeded.value
    && Boolean(savedModel)
    && savedModel !== 'custom'
    && !discoveredModels.value.some(model => model.value === savedModel)
})

// Persistent live region is only placed in flow while it carries a message.
const catalogStatusVisible = computed(() => modelDiscoveryLoading.value
  || modelDiscoveryFailed.value
  || (modelDiscoverySucceeded.value && discoveredModels.value.length === 0))

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL;
  const isPredefined = (CONFIG.OPENROUTER_MODELS || []).some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
  customModelVisible.value = !isPredefined
}

const discoverModels = async (apiKey) => {
  const requestId = ++discoveryRequestId
  const key = typeof apiKey === 'string' ? apiKey : ''
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  modelDiscoveryFailed.value = false
  const cached = getCachedOpenRouterModels(key)
  if (cached !== null) {
    discoveredModels.value = cached
    modelDiscoverySucceeded.value = true
    modelDiscoveryLoading.value = false
    return
  }
  modelDiscoveryLoading.value = true
  try {
    const models = await fetchOpenRouterModels({ apiKey: key, signal: controller.signal })
    if (requestId !== discoveryRequestId || key !== openrouterApiKey.value) return
    discoveredModels.value = models
    modelDiscoverySucceeded.value = true
    modelDiscoveryFailed.value = false
  } catch {
    if (requestId !== discoveryRequestId || key !== openrouterApiKey.value) return
    modelDiscoverySucceeded.value = false
    modelDiscoveryFailed.value = true
  } finally {
    if (requestId === discoveryRequestId && key === openrouterApiKey.value) modelDiscoveryLoading.value = false
  }
}

const catalogModelSelection = computed({
  get: () => {
    return settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL
  },
  set: (value) => {
    if (!value) return
    selectedModelOption.value = value
    customModelVisible.value = false
    settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value)
    settingsStore.updateSettingLocally('OPENROUTER_MODEL_SOURCE', 'catalog')
  }
})

watch(openrouterApiKey, (apiKey) => {
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

const openrouterApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    if (value !== 'custom') customModelVisible.value = false
    else customModelVisible.value = true
    // Capture before either setting is modified: the write-through store would
    // otherwise make the "previous" model indistinguishable from the new value.
    const previousModel = settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL
    const previousSource = settingsStore.settings?.OPENROUTER_MODEL_SOURCE || CONFIG.OPENROUTER_MODEL_SOURCE
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value)
    }
    const isCurated = (CONFIG.OPENROUTER_MODELS || []).some(model => model.value === value && model.value !== 'custom')
    const isCatalog = discoveredModels.value.some(model => model.value === value)
    // Reselecting the already-saved model must not demote explicit catalog/custom
    // provenance when discovery is unavailable; genuinely new IDs still resolve below.
    const isReselectedSaved = value !== 'custom' && value === previousModel
      && (previousSource === 'catalog' || previousSource === 'custom')
    settingsStore.updateSettingLocally('OPENROUTER_MODEL_SOURCE', value === 'custom' ? 'custom' : isCurated ? 'curated' : isCatalog ? 'catalog' : isReselectedSaved ? previousSource : 'legacy')
    // If 'custom' is selected, wait for user input in custom field
  }
})

const openrouterCustomModel = computed({
  get: () => selectedModelOption.value === 'custom' && customModelVisible.value
    ? settingsStore.settings?.OPENROUTER_API_MODEL || CONFIG.OPENROUTER_API_MODEL
    : '',
  set: (value) => {
    customModelVisible.value = true
    settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value);
    settingsStore.updateSettingLocally('OPENROUTER_MODEL_SOURCE', 'custom')
  }
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerId) => {
  if (!openrouterApiKey.value.trim()) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      openrouterApiKey.value, 
      providerId,
      {
        apiModel: openrouterApiModel.value === 'custom' ? openrouterCustomModel.value : openrouterApiModel.value
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
      settingsStore.updateSettingLocally('OPENROUTER_API_KEY', result.reorderedString)
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
  discoverModels(openrouterApiKey.value)
})
</script>
