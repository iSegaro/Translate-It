<template>
  <div>
  <h3>{{ t('webai_api_settings_title') || 'WebAI API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('webai_api_key_info') || 'Run your API Server.' }}
      </span>
      <a
        class="api-link"
        href="https://github.com/Amm1rr/WebAI-to-API"
        target="_blank"
        rel="noopener noreferrer"
      >
  {{ t('webai_api_key_link') || 'Get and Run your locally hosted WebAI API server.' }}
      </a>
    </div>
    <div class="setting-group">
  <label>{{ t('webai_api_url_label') || 'WebAI API URL' }}</label>
      <BaseInput
        v-model="webAIApiUrl"
  :placeholder="t('webai_api_url_placeholder') || 'Enter WebAI API URL'"
      />
    </div>
    <div class="setting-group">
  <label>{{ t('webai_api_model_label') || 'WebAI API Model' }}</label>
      <BaseInput
        v-model="webAIApiModel"
  :placeholder="t('webai_api_model_placeholder') || 'Enter WebAI API model'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/store/core/settings'
import BaseInput from '@/components/base/BaseInput.vue'

const { t } = useI18n()

const settingsStore = useSettingsStore()

const webAIApiUrl = computed({
  get: () => settingsStore.settings?.WEBAI_API_URL || '',
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_URL', value)
})

const webAIApiModel = computed({
  get: () => settingsStore.settings?.WEBAI_API_MODEL || '',
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_MODEL', value)
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
