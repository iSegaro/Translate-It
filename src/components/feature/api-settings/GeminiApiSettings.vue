<template>
  <div>
    <h3>{{ t('gemini_api_settings_title') || 'Gemini API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('gemini_api_key_info') || 'You can get your Gemini API key from' }}
      </span>
      <a
        class="api-link"
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('gemini_api_key_link') || 'Get Your Free API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ t('custom_api_settings_api_key_label') || 'API Keys' }}</label>
      <div class="api-key-input-wrapper">
        <BaseTextarea
          v-model="geminiApiKey"
          :placeholder="t('gemini_api_key_placeholder') || 'Enter your API keys (one per line)'"
          :rows="3"
          class="api-key-textarea"
          :password-mask="true"
        />
        <button
          @click="testKeys"
          :disabled="testingKeys || !hasKeys"
          class="test-keys-button"
          :class="{ 'testing-keys': testingKeys }"
        >
          {{ testingKeys ? 'Testing...' : 'Test Keys' }}
        </button>
      </div>
      <div v-if="testResult" class="test-result" :class="testResult.allInvalid ? 'error' : 'success'">
        {{ testResult.message }}
      </div>
    </div>
    <div class="setting-group">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="geminiModel"
        :options="geminiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
      <label>{{ t('gemini_api_settings_api_url_label') || 'API URL' }}</label>
      <BaseInput
        v-model="geminiApiUrl"
        :placeholder="t('gemini_api_url_placeholder') || 'Enter custom API URL'"
        class="api-url-input"
      />
      <span class="setting-description">
        {{ t('gemini_custom_api_url_info') || 'Enter the complete API URL including the model name' }}
      </span>
    </div>
    <div
      v-if="isThinkingSupported"
      class="setting-group"
    >
      <BaseCheckbox
        v-model="geminiThinking"
        :disabled="!isThinkingControllable"
        :label="t('gemini_thinking_label') || 'Enable Thinking Mode'"
      />
      <span class="setting-description">
        {{ t('gemini_thinking_description') || thinkingDescription }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const geminiApiKey = computed({
  get: () => settingsStore.settings?.GEMINI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('GEMINI_API_KEY', value)
})

const hasKeys = computed(() => {
  return geminiApiKey.value.trim().length > 0
})

const geminiApiUrl = computed({
  get: () => settingsStore.settings?.GEMINI_API_URL || CONFIG.GEMINI_API_URL,
  set: (value) => settingsStore.updateSettingLocally('GEMINI_API_URL', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('gemini-2.5-flash')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.GEMINI_MODEL || 'gemini-2.5-flash';
  // If currentModel is 'custom' or not in predefined options, set to 'custom'
  const isPredefined = geminiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = (currentModel === 'custom' || !isPredefined) ? 'custom' : currentModel;
}

const geminiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    // Always save the selected value, including 'custom'
    settingsStore.updateSettingLocally('GEMINI_MODEL', value)
  }
})

const geminiThinking = computed({
  get: () => settingsStore.settings?.GEMINI_THINKING_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('GEMINI_THINKING_ENABLED', value)
})

// Get model options from CONFIG to maintain consistency
const geminiModelOptions = ref(
  CONFIG.GEMINI_MODELS?.map(model => ({
    value: model.value,
    label: model.name
  })) || [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    { value: 'custom', label: 'Custom Model' }
  ]
)

// Track thinking mode properties for current model
const isThinkingSupported = ref(false)
const isThinkingControllable = ref(true)
const thinkingDescription = ref('Allow the model to think step-by-step before responding.')

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async () => {
  if (!hasKeys.value) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(geminiApiKey.value, 'Gemini')

    // Build translated message from messageKey and params
    const message = result.messageKey
      ? (result.params ? t(result.messageKey, result.params) : t(result.messageKey))
      : null

    testResult.value = {
      ...result,
      message
    }

    // Update the local value with the reordered keys
    if (!result.allInvalid && result.reorderedString) {
      settingsStore.updateSettingLocally('GEMINI_API_KEY', result.reorderedString)
    }
  } catch (error) {
    testResult.value = {
      message: t('api_test_failed', { error: error.message }),
      allInvalid: true
    }
  } finally {
    testingKeys.value = false
  }
}

// Watch for model changes to update thinking mode availability
const updateThinkingModeAvailability = (newModel) => {
  const modelConfig = CONFIG.GEMINI_MODELS?.find(model => model.value === newModel)
  if (modelConfig && modelConfig.thinking) {
    const { supported, controllable, defaultEnabled } = modelConfig.thinking

    isThinkingSupported.value = supported

    if (supported) {
      isThinkingControllable.value = controllable

      // Update description based on model
      if (newModel === 'gemini-2.5-pro' && !controllable) {
        thinkingDescription.value = 'Thinking mode is always enabled for Gemini 2.5 Pro and cannot be disabled.'
      } else {
        thinkingDescription.value = 'Allow the model to think step-by-step before responding.'
      }

      // Set default value for non-controllable models
      if (!controllable) {
        geminiThinking.value = defaultEnabled
      }
    }
  } else {
    // For custom models, allow user to control thinking mode
    if (newModel === 'custom') {
      isThinkingSupported.value = true
      isThinkingControllable.value = true
      thinkingDescription.value = 'Allow the model to think step-by-step before responding.'
    } else {
      // For unknown models or those without thinking support
      isThinkingSupported.value = false
      isThinkingControllable.value = false
    }
  }
}

// Watch for selectedModelOption changes to update thinking mode availability
const watchRef = ref(null)
watchRef.value = watch(selectedModelOption, (newModel) => {
  updateThinkingModeAvailability(newModel)
}, { immediate: true })

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;

.api-key-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-start;

  .api-key-textarea {
    flex: 1;
  }

  .test-keys-button {
    padding: 8px 16px;
    background-color: var(--color-primary, #1976d2);
    color: white;
    border: none;
    border-radius: var(--border-radius-base, 4px);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-base, 0.2s);

    &:hover:not(:disabled) {
      background-color: var(--color-primary-dark, #1565c0);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.testing-keys {
      opacity: 0.8;
      cursor: wait;
    }
  }
}

.test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--border-radius-base, 4px);
  font-size: 14px;

  &.success {
    background-color: var(--color-success-bg, #e8f5e9);
    color: var(--color-success-text, #2e7d32);
  }

  &.error {
    background-color: var(--color-error-bg, #ffebee);
    color: var(--color-error-text, #c62828);
  }
}
</style>
