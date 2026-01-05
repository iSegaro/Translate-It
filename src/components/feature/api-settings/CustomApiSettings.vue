<template>
  <div>
    <h3>{{ t('custom_api_settings_title') || 'Custom API Settings' }}</h3>
    <span class="setting-description">
      {{ t('custom_api_settings_description') || 'Use any API service that is compatible with the OpenAI chat completions format.' }}
    </span>
    <div class="setting-group">
      <label>{{ t('custom_api_settings_api_url_label') || 'API URL' }}</label>
      <BaseInput
        v-model="customApiUrl"
        :placeholder="t('custom_api_url_placeholder') || 'Enter the base URL of your custom API'"
      />
      <span class="setting-help-text">
        {{ t('custom_api_url_example') || 'Example:' }} https://openai.com/v1/chat/completions
      </span>
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
          v-model="customApiKey"
          :placeholder="t('custom_api_key_placeholder') || 'Enter your API keys (one per line)'"
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
      <label>{{ t('custom_api_settings_model_label') || 'Model' }}</label>
      <BaseInput
        v-model="customApiModel"
        :placeholder="t('custom_api_model_placeholder') || 'Enter the model name'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'

const { t } = useI18n()

const settingsStore = useSettingsStore()
const textareaRef = ref(null)
const passwordVisible = ref(false)

const customApiUrl = computed({
  get: () => settingsStore.settings?.CUSTOM_API_URL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_URL', value)
})

const customApiKey = computed({
  get: () => settingsStore.settings?.CUSTOM_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_KEY', value)
})

const hasKeys = computed(() => {
  return customApiKey.value.trim().length > 0
})

const customApiModel = computed({
  get: () => settingsStore.settings?.CUSTOM_API_MODEL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_MODEL', value)
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async () => {
  if (!hasKeys.value) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(customApiKey.value, 'Custom')

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
      settingsStore.updateSettingLocally('CUSTOM_API_KEY', result.reorderedString)
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
