<template>
  <div>
    <h3>{{ $i18n('deepseek_api_settings_title') || 'DeepSeek API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ $i18n('deepseek_api_key_info') || 'Get your DeepSeek API key from' }}
      </span>
      <a
        class="api-link"
        href="https://platform.deepseek.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $i18n('deepseek_api_key_link') || 'Get DeepSeek API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ $i18n('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="deepseekApiKey"
        type="password"
        :placeholder="$i18n('deepseek_api_key_placeholder') || 'Paste your DeepSeek API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
      <label>{{ $i18n('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseDropdown
        v-model="deepseekApiModel"
        :options="deepseekApiModelOptions"
        class="model-select"
      />
    </div>
    <div v-if="deepseekApiModel === 'custom'" class="setting-group">
      <label>{{ $i18n('deepseek_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="deepseekCustomModel"
        :placeholder="$i18n('deepseek_custom_model_placeholder') || 'Enter custom model name'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDropdown from '@/components/base/BaseDropdown.vue'

const settingsStore = useSettingsStore()

const deepseekApiKey = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', value)
})

const deepseekApiModel = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_MODEL || 'deepseek-chat',
  set: (value) => {
    if (value === 'custom') {
      // Handled by deepseekCustomModel's setter
    } else {
      settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value)
    }
  }
})

const deepseekCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL;
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
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
