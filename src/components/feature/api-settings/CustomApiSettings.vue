<template>
  <div class="custom-settings">
    <div class="api-info">
      <h3>{{ t('custom_api_settings_title') || 'Custom OpenAI Compatible Settings' }}</h3>
      <p class="setting-description">
        {{ t('custom_api_settings_description') || 'Use any service that is compatible with the OpenAI chat completions format.' }}
      </p>
    </div>
    <div class="setting-group vertical">
      <label>{{ t('custom_api_settings_api_url_label') || 'API URL' }}</label>
      <BaseInput
        id="CUSTOM_API_URL"
        v-model="customApiUrl"
        :placeholder="t('custom_api_url_placeholder') || '(e.g., v1/chat/completions)'"
        class="api-url-input"
        dir="ltr"
      />
      <p class="setting-help-text">
        {{ t('custom_api_url_example') || 'Example:' }} https://openai.com/v1/chat/completions
      </p>
    </div>
    <ApiKeyInput
      id="CUSTOM_API_KEY"
      v-model="customApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('custom_api_key_placeholder') || 'Enter your API keys (one per line)'"
      provider-name="Custom"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('custom_api_settings_model_label') || 'Model' }}</label>
      <BaseInput
        v-model="customApiModel"
        :placeholder="t('custom_api_model_placeholder') || 'Enter the model name'"
        class="model-select"
        dir="ltr"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import "./CustomApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseInput from '@/components/base/BaseInput.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { storageManager } from '@/shared/storage/core/StorageCore.js'

const { t } = useI18n()

const settingsStore = useSettingsStore()

const customApiUrl = computed({
  get: () => settingsStore.settings?.CUSTOM_API_URL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_URL', value)
})

const customApiKey = computed({
  get: () => settingsStore.settings?.CUSTOM_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_KEY', value)
})

const customApiModel = computed({
  get: () => settingsStore.settings?.CUSTOM_API_MODEL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_MODEL', value)
})

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerName) => {
  testingKeys.value = true
  testResult.value = null

  try {
    // If URL is empty, get from storage and update the field
    let testApiUrl = customApiUrl.value

    if (!testApiUrl || testApiUrl.trim() === '') {
      // Read directly from storage (same as ApiKeyManager does)
      const settings = await storageManager.get({
        CUSTOM_API_URL: '',
        CUSTOM_API_MODEL: ''
      })
      const storedUrl = settings.CUSTOM_API_URL || ''

      if (storedUrl && storedUrl.trim() !== '') {
        testApiUrl = storedUrl
        // Update the field to show the stored URL (triggers computed setter)
        customApiUrl.value = storedUrl
      }
    }

    // Test keys directly from textbox value, passing current URL and Model context
    const result = await ApiKeyManager.testKeysDirect(
      customApiKey.value,
      providerName,
      {
        apiUrl: testApiUrl,
        apiModel: customApiModel.value
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
      settingsStore.updateSettingLocally('CUSTOM_API_KEY', result.reorderedString)
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
</script>
