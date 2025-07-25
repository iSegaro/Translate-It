<template>
  <div>
    <h3>{{ $i18n('openai_api_settings_title') || 'OpenAI API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ $i18n('openai_api_key_info') || 'Get your OpenAI API key from' }}
      </span>
      <a
        class="api-link"
        href="https://platform.openai.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $i18n('openai_api_key_link') || 'Get OpenAI API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ $i18n('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="openaiApiKey"
        type="password"
        :placeholder="$i18n('openai_api_key_placeholder') || 'Paste your OpenAI API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
      <label>{{ $i18n('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseDropdown
        v-model="openaiApiModel"
        :options="openaiApiModelOptions"
        class="model-select"
      />
    </div>
    <div v-if="openaiApiModel === 'custom'" class="setting-group">
      <label>{{ $i18n('openai_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openaiCustomModel"
        :placeholder="$i18n('openai_custom_model_placeholder') || 'Enter custom model name'"
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

const openaiApiKey = computed({
  get: () => settingsStore.settings?.OPENAI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENAI_API_KEY', value)
})

const openaiApiModel = computed({
  get: () => settingsStore.settings?.OPENAI_API_MODEL || 'gpt-3.5-turbo',
  set: (value) => {
    // If custom model is selected, update OPENAI_API_MODEL with the custom value
    if (value === 'custom') {
      // This will be handled by the custom model input's v-model directly updating openaiCustomModel
      // and then openaiCustomModel's setter updating OPENAI_API_MODEL
    } else {
      settingsStore.updateSettingLocally('OPENAI_API_MODEL', value)
    }
  }
})

const openaiCustomModel = computed({
  get: () => {
    // If the current OPENAI_API_MODEL is not in the predefined options, it's a custom model
    const currentModel = settingsStore.settings?.OPENAI_API_MODEL;
    const isPredefined = openaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    // When custom model input changes, update the main OPENAI_API_MODEL setting
    settingsStore.updateSettingLocally('OPENAI_API_MODEL', value);
  }
})

const openaiApiModelOptions = ref([
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'custom', label: 'Custom Model' }
])
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
