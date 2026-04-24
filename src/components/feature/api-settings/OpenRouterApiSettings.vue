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
      provider-name="OpenRouter"
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
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import "./OpenRouterApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const openrouterApiKey = computed({
  get: () => settingsStore.settings?.OPENROUTER_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENROUTER_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('openai/gpt-4o')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.OPENROUTER_API_MODEL || 'openai/gpt-4o';
  const isPredefined = openrouterApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const openrouterApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const openrouterCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.OPENROUTER_API_MODEL || 'openai/gpt-4o';
    const isPredefined = openrouterApiModelOptions?.value?.some(option => option.value === currentModel && option.value !== 'custom') || false;
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value);
  }
})

const openrouterApiModelOptions = computed(() => {
  const models = settingsStore.settings?.OPENROUTER_MODELS || CONFIG.OPENROUTER_MODELS || []
  return models.map(model => ({
    value: model.value,
    label: model.name || model.value
  }))
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerName) => {
  if (!openrouterApiKey.value.trim()) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      openrouterApiKey.value, 
      providerName,
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
      messageKey: 'api_test_failed',
      params: { error: error.message }
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
