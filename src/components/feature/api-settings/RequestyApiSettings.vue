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
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
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

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const requestyApiKey = computed({
  get: () => settingsStore.settings?.REQUESTY_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('REQUESTY_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref(CONFIG.REQUESTY_API_MODEL)

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL;
  const isPredefined = requestyApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const requestyApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('REQUESTY_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const requestyCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.REQUESTY_API_MODEL || CONFIG.REQUESTY_API_MODEL;
    const isPredefined = requestyApiModelOptions?.value?.some(option => option.value === currentModel && option.value !== 'custom') || false;
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('REQUESTY_API_MODEL', value);
  }
})

const requestyApiModelOptions = computed(() => {
  const models = settingsStore.settings?.REQUESTY_MODELS || CONFIG.REQUESTY_MODELS || []
  return models.map(model => ({
    value: model.value,
    label: model.name || model.value
  }))
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
})
</script>
