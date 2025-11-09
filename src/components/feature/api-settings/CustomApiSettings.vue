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
      <label>{{ t('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="customApiKey"
        type="password"
        :placeholder="t('custom_api_key_placeholder') || 'Paste your custom API key here'"
        class="api-key-input"
      />
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
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseInput from '@/components/base/BaseInput.vue'

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
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;
</style>
