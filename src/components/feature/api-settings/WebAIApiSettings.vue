<template>
  <div>
    <h3>{{ $i18n('webai_api_settings_title') || 'WebAI API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ $i18n('webai_api_key_info') || 'Run your API Server.' }}
      </span>
      <a
        class="api-link"
        href="https://github.com/Amm1rr/WebAI-to-API"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $i18n('webai_api_key_link') || 'Get and Run your locally hosted WebAI API server.' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ $i18n('webai_api_url_label') || 'WebAI API URL' }}</label>
      <BaseInput
        v-model="webAIApiUrl"
        :placeholder="$i18n('webai_api_url_placeholder') || 'Enter WebAI API URL'"
      />
    </div>
    <div class="setting-group">
      <label>{{ $i18n('webai_api_model_label') || 'WebAI API Model' }}</label>
      <BaseInput
        v-model="webAIApiModel"
        :placeholder="$i18n('webai_api_model_placeholder') || 'Enter WebAI API model'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import BaseInput from '@/components/base/BaseInput.vue'

const settingsStore = useSettingsStore()

const webAIApiUrl = computed({
  get: () => settingsStore.settings?.WEB_AI_API_URL || '',
  set: (value) => settingsStore.updateSetting('WEB_AI_API_URL', value)
})

const webAIApiModel = computed({
  get: () => settingsStore.settings?.WEB_AI_API_MODEL || '',
  set: (value) => settingsStore.updateSetting('WEB_AI_API_MODEL', value)
})
</script>

<style lang="scss" scoped>
@import '@/assets/styles/_api-settings-common.scss';
</style>
