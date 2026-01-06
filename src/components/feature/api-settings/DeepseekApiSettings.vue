<template>
  <div>
    <h3>{{ t('deepseek_api_settings_title') || 'DeepSeek API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('deepseek_api_key_info') || 'Get your DeepSeek API key from' }}
      </span>
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
      v-model="deepseekApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('deepseek_api_key_placeholder') || 'Enter your API keys (one per line)'"
      provider-name="DeepSeek"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="deepseekApiModel"
        :options="deepseekApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
      <label>{{ t('deepseek_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="deepseekCustomModel"
        :placeholder="t('deepseek_custom_model_placeholder') || 'Enter custom model name'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const deepseekApiKey = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('deepseek-chat')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL || 'deepseek-chat';
  const isPredefined = deepseekApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const deepseekApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const deepseekCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL || 'deepseek-chat';
    const isPredefined = deepseekApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value);
  }
})

const deepseekApiModelOptions = ref([
  { value: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
  { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
  { value: 'custom', label: 'Custom Model' }
])

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerName) => {
  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(deepseekApiKey.value, providerName)

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

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;
</style>
