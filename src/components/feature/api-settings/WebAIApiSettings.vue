<template>
  <div class="webai-settings">
    <h3>{{ t('webai_api_settings_title') || 'WebAI API Settings' }}</h3>
    <div class="setting-group vertical api-key-info">
      <p class="setting-description">
        {{ t('webai_api_key_info') || 'Run your API Server.' }}
      </p>
      <a
        class="api-link"
        :href="REPO_URLS.WEBAI_API"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('webai_api_key_link') || 'Get and Run your locally hosted WebAI API server.' }}
      </a>
    </div>
    <div class="setting-group vertical">
      <label>{{ t('webai_api_url_label') || 'WebAI API URL' }}</label>
      <BaseInput
        id="WEBAI_API_URL"
        v-model="webAIApiUrl"
        :placeholder="t('webai_api_url_placeholder') || 'Enter WebAI API URL'"
        class="api-url-input"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <label>{{ t('webai_api_model_label') || 'WebAI API Model' }}</label>
      <BaseInput
        v-model="webAIApiModel"
        :placeholder="t('webai_api_model_placeholder') || 'Enter WebAI API model'"
        class="model-select"
        dir="ltr"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import "./WebAIApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import { REPO_URLS } from '@/shared/config/constants.js'

const { t } = useI18n()

const settingsStore = useSettingsStore()

const webAIApiUrl = computed({
  get: () => settingsStore.settings?.WEBAI_API_URL || CONFIG.WEBAI_API_URL,
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_URL', value)
})

const webAIApiModel = computed({
  get: () => settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL,
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_MODEL', value)
})
</script>
