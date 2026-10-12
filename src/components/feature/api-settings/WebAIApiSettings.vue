<template>
  <div class="webai-settings">
    <h3>{{ t('webai_api_settings_title') || 'WebAI API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <p class="setting-description">
        {{ t('webai_api_key_info') || 'Run your API Server.' }}
      </p>
      <a
        class="api-link"
        :href="REPO_URLS.WEBAI_API"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('webai_api_key_link') || 'Get and Run your locally hosted WebAI API server.' }}
      </a>
    </div>
    <div class="setting-group vertical">
      <label>{{ t('webai_api_url_label') || 'WebAI API URL' }}</label>
      <BaseInput
        id="WEBAI_API_URL"
        v-model="webAIApiUrl"
        :placeholder="t('webai_api_url_placeholder') || 'Enter WebAI API URL'"
        class="api-url-input"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <label for="webai-model-select">{{ t('webai_api_model_label') || 'WebAI API Model' }}</label>
      <BaseSelect
        id="webai-model-select"
        v-model="webAIApiModel"
        class="model-select"
        :options="webAIApiModelOptions"
        :style="rtlSelectStyle"
      />
      <div
        class="model-discovery-status-live"
        :class="{ 'ti-sr-only': !modelDiscoveryStatusVisible }"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <small
          v-if="modelDiscoveryLoading"
          class="model-discovery-status"
        >{{ t('webai_models_loading') || 'Checking available models…' }}</small>
        <small
          v-else-if="modelDiscoveryFailed"
          class="model-discovery-status"
        >{{ t('webai_models_discovery_failed') || 'Could not check available models.' }}</small>
        <small
          v-else-if="savedModelNotAdvertised"
          class="model-discovery-status"
        >{{ t('webai_model_not_advertised') || 'Saved model was not listed by the server.' }}</small>
      </div>
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('custom_api_settings_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="webAIApiCustomModel"
        :placeholder="t('custom_api_model_placeholder') || 'Enter custom model name'"
        class="model-select"
        dir="ltr"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import "./WebAIApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { REPO_URLS } from '@/shared/constants/core.js'
import {
  fetchWebAIModels,
  getCachedWebAIModels,
  resolveWebAIModelsUrl,
} from '@/features/translation/providers/WebAIModelDiscovery.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const webAIApiUrl = computed({
  get: () => settingsStore.settings?.WEBAI_API_URL || CONFIG.WEBAI_API_URL,
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_URL', value)
})

const selectedModelOption = ref(CONFIG.WEBAI_API_MODEL)
const discoveredModels = ref([])
const modelDiscoverySucceeded = ref(false)
const modelDiscoveryLoading = ref(false)
const modelDiscoveryFailed = ref(false)
const savedModelNotAdvertised = computed(() => modelDiscoverySucceeded.value
  && (settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL) !== 'custom'
  && !discoveredModels.value.includes(settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL))

// Persistent live region is only placed in flow while it carries a message.
const modelDiscoveryStatusVisible = computed(() => modelDiscoveryLoading.value
  || modelDiscoveryFailed.value
  || savedModelNotAdvertised.value)

let discoveryRequestId = 0
let discoveryTimer
let activeController
let selectionInteraction = 0
let lastObservedModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
let externalSelectionInteraction = -1
let externalSelectionModel
let localModelUpdate = false
const updateModelLocally = (value) => {
  localModelUpdate = true
  settingsStore.updateSettingLocally('WEBAI_API_MODEL', value)
  localModelUpdate = false
}

const webAIApiModelOptions = computed(() => {
  const models = CONFIG.WEBAI_MODELS || []
  const options = models.filter(model => model.value !== 'custom').map(model => ({
    value: model.value,
    label: model.name || model.value
  }))
  for (const id of discoveredModels.value) {
    if (!options.some(option => option.value === id)) options.push({ value: id, label: id })
  }
  const savedModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
  if (savedModel && savedModel !== 'custom' && !options.some(option => option.value === savedModel)) {
    options.push({ value: savedModel, label: savedModel, legacy: true })
  }
  const custom = models.find(model => model.value === 'custom')
  options.push({ value: 'custom', label: custom?.name || 'Custom' })
  return options
})

const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
  const isPredefined = (CONFIG.WEBAI_MODELS || []).some(option => option.value === currentModel && option.value !== 'custom')
    || discoveredModels.value.includes(currentModel)
  selectedModelOption.value = isPredefined ? currentModel : 'custom'
}

watch(() => settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL, (model) => {
  if (model === lastObservedModel) return
  lastObservedModel = model
  if (localModelUpdate) return
  selectionInteraction++
  externalSelectionInteraction = selectionInteraction
  externalSelectionModel = model
  const isKnown = (CONFIG.WEBAI_MODELS || []).some(option => option.value === model && option.value !== 'custom')
    || discoveredModels.value.includes(model)
  selectedModelOption.value = isKnown ? model : 'custom'
}, { flush: 'sync' })

const discoverModels = async (apiUrl, selectionAtStart = selectionInteraction) => {
  const requestId = ++discoveryRequestId
  const resolvedUrl = resolveWebAIModelsUrl(apiUrl)
  activeController?.abort()
  const controller = new AbortController()
  activeController = controller
  const cached = getCachedWebAIModels(apiUrl)
  modelDiscoveryFailed.value = false
  if (cached !== null) {
    discoveredModels.value = cached
    modelDiscoverySucceeded.value = true
    modelDiscoveryLoading.value = false
    syncSavedSelection(requestId, resolvedUrl, selectionAtStart)
    return
  }
  if (!apiUrl?.trim()) {
    discoveredModels.value = []
    modelDiscoverySucceeded.value = false
    modelDiscoveryLoading.value = false
    return
  }
  discoveredModels.value = []
  modelDiscoverySucceeded.value = false
  modelDiscoveryLoading.value = true
  try {
    const models = await fetchWebAIModels(apiUrl, { signal: controller.signal })
    if (requestId !== discoveryRequestId || resolvedUrl !== resolveWebAIModelsUrl(webAIApiUrl.value)) return
    discoveredModels.value = models
    modelDiscoverySucceeded.value = true
    modelDiscoveryFailed.value = false
    syncSavedSelection(requestId, resolvedUrl, selectionAtStart)
  } catch {
    if (requestId !== discoveryRequestId || resolvedUrl !== resolveWebAIModelsUrl(webAIApiUrl.value)) return
    modelDiscoverySucceeded.value = false
    modelDiscoveryFailed.value = true
  } finally {
    if (requestId === discoveryRequestId && resolvedUrl === resolveWebAIModelsUrl(webAIApiUrl.value)) modelDiscoveryLoading.value = false
  }
}

function syncSavedSelection(requestId, resolvedUrl, selectionAtStart) {
  const savedModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
  const isCurrentExternalSelection = selectionAtStart !== selectionInteraction
    && externalSelectionInteraction === selectionInteraction
    && externalSelectionModel === savedModel
  if (requestId !== discoveryRequestId
    || resolvedUrl !== resolveWebAIModelsUrl(webAIApiUrl.value)
    || settingsStore.isSettingDirty('WEBAI_API_MODEL')
    || (selectionAtStart !== selectionInteraction && !isCurrentExternalSelection)
    || selectedModelOption.value !== 'custom') return
  const isPredefined = (CONFIG.WEBAI_MODELS || []).some(model => model.value === savedModel && model.value !== 'custom')
    || discoveredModels.value.includes(savedModel)
  if (isPredefined) selectedModelOption.value = savedModel
}

watch(webAIApiUrl, (url) => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
  discoveredModels.value = []
  modelDiscoverySucceeded.value = false
  modelDiscoveryFailed.value = false
  const requestId = ++discoveryRequestId
  modelDiscoveryLoading.value = false
  const selectionAtSchedule = selectionInteraction
  discoveryTimer = setTimeout(() => {
    if (requestId === discoveryRequestId) discoverModels(url, selectionAtSchedule)
  }, 400)
}, { flush: 'sync' })

onBeforeUnmount(() => {
  clearTimeout(discoveryTimer)
  discoveryRequestId++
  activeController?.abort()
  activeController = null
})

const webAIApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectionInteraction++
    selectedModelOption.value = value
    if (value !== 'custom') {
      updateModelLocally(value)
    }
  }
})

const webAIApiCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
    return selectedModelOption.value === 'custom' ? currentModel : ''
  },
  set: (value) => {
    selectionInteraction++
    updateModelLocally(value)
  }
})

onMounted(() => {
  initializeModelSelection()
  // Discovery stays component-local and in memory; never write WEBAI_MODELS,
  // which is synchronized from CONFIG by settings migrations.
  discoverModels(webAIApiUrl.value, selectionInteraction)
})
</script>
