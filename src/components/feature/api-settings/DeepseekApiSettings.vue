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
    <div class="setting-group">
      <div class="label-with-toggle">
        <label>{{ t('custom_api_settings_api_key_label') || 'API Keys' }}</label>
        <button
          type="button"
          class="toggle-visibility-button"
          @click="togglePasswordVisibility"
          :title="passwordVisible ? 'Hide' : 'Show'"
        >
          <img
            v-if="!passwordVisible"
            :src="eyeIcon"
            alt="Show"
            class="toggle-icon"
            width="16"
            height="16"
          >
          <img
            v-else
            :src="eyeHideIcon"
            alt="Hide"
            class="toggle-icon"
            width="16"
            height="16"
          >
        </button>
      </div>
      <div class="api-key-input-wrapper">
        <BaseTextarea
          ref="textareaRef"
          v-model="deepseekApiKey"
          :placeholder="t('deepseek_api_key_placeholder') || 'Enter your API keys (one per line)'"
          :rows="3"
          class="api-key-textarea"
          :password-mask="true"
          :hide-toggle="true"
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
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()
const textareaRef = ref(null)
const passwordVisible = ref(false)

const deepseekApiKey = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', value)
})

const hasKeys = computed(() => {
  return deepseekApiKey.value.trim().length > 0
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

const testKeys = async () => {
  if (!hasKeys.value) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(deepseekApiKey.value, 'DeepSeek')

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
      settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', result.reorderedString)
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

// Toggle password visibility
const togglePasswordVisibility = () => {
  if (textareaRef.value) {
    textareaRef.value.toggleVisibility()
    passwordVisible.value = textareaRef.value.visibilityVisible
  }
}

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;

.label-with-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-sm;
  gap: $spacing-sm;

  label {
    margin-bottom: 0;
    flex: 1;
  }

  .toggle-visibility-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity var(--transition-base, 0.2s);
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }

    .toggle-icon {
      display: block;
      pointer-events: none;
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
  }
}

.api-key-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .api-key-textarea {
    width: 100%;
  }

  .test-keys-button {
    align-self: flex-end;
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
