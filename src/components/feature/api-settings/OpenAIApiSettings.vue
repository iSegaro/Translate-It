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
      provider-name="OpenAI"
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
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import "./OpenAIApiSettings.scss"
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

const openaiApiKey = computed({
  get: () => settingsStore.settings?.OPENAI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENAI_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('gpt-4o')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.OPENAI_API_MODEL || 'gpt-4o';
  const isPredefined = openaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const openaiApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('OPENAI_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const openaiCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.OPENAI_API_MODEL || 'gpt-4o';
    const isPredefined = openaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('OPENAI_API_MODEL', value);
  }
})

const openaiApiModelOptions = computed(() => {
  const models = settingsStore.settings?.OPENAI_MODELS || CONFIG.OPENAI_MODELS || []
  return models.map(model => ({
    value: model.value,
    label: model.name || model.value
  }))
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerName) => {
  if (!openaiApiKey.value.trim()) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value, passing current Model context
    const result = await ApiKeyManager.testKeysDirect(
      openaiApiKey.value, 
      providerName,
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
