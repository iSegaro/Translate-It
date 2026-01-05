<template>
  <div>
    <h3>{{ t('openrouter_api_settings_title') || 'OpenRouter API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('openrouter_api_key_info') || 'Get your OpenRouter API key from' }}
      </span>
      <a
        class="api-link"
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('openrouter_api_key_link') || 'Get OpenRouter API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ t('custom_api_settings_api_key_label') || 'API Keys' }}</label>
      <div class="api-key-input-wrapper">
        <BaseTextarea
          v-model="openrouterApiKey"
          :placeholder="t('openrouter_api_key_placeholder') || 'Enter your API keys (one per line)'"
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
        v-model="openrouterApiModel"
        :options="openrouterApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
      <label>{{ t('openrouter_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openrouterCustomModel"
        :placeholder="t('openrouter_custom_model_placeholder') || 'Enter custom model name (e.g., provider/model-name)'"
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
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const openrouterApiKey = computed({
  get: () => settingsStore.settings?.OPENROUTER_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENROUTER_API_KEY', value)
})

const hasKeys = computed(() => {
  return openrouterApiKey.value.trim().length > 0
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
    const isPredefined = openrouterApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value);
  }
})

const openrouterApiModelOptions = ref([
  { value: 'openai/gpt-5', label: 'GPT-5' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'openai/gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1' },
  { value: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
  { value: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B' },
  { value: 'mistralai/mistral-large', label: 'Mistral Large' },
  { value: 'custom', label: 'Custom Model' }
])

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async () => {
  if (!hasKeys.value) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(openrouterApiKey.value, 'OpenRouter')
    testResult.value = result

    // Update the local value with the reordered keys
    if (!result.allInvalid && result.reorderedString) {
      settingsStore.updateSettingLocally('OPENROUTER_API_KEY', result.reorderedString)
    }
  } catch (error) {
    testResult.value = {
      message: 'Failed to test keys: ' + error.message,
      allInvalid: true
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
