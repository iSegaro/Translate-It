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
    <ApiKeyInput
      v-model="customApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('custom_api_key_placeholder') || 'Enter your API keys (one per line)'"
      provider-name="Custom"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />
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
import ApiKeyInput from './ApiKeyInput.vue'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

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
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(customApiKey.value, providerName)

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

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;
</style>
