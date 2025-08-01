<template>
  <div>
    <h3>{{ $i18n('openrouter_api_settings_title') || 'OpenRouter API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ $i18n('openrouter_api_key_info') || 'Get your OpenRouter API key from' }}
      </span>
      <a
        class="api-link"
        href="https://openrouter.ai/settings/keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $i18n('openrouter_api_key_link') || 'Get OpenRouter API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ $i18n('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="openrouterApiKey"
        type="password"
        :placeholder="$i18n('openrouter_api_key_placeholder') || 'Paste your OpenRouter API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
      <label>{{ $i18n('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseDropdown
        v-model="openrouterApiModel"
        :options="openrouterApiModelOptions"
        class="model-select"
      />
    </div>
    <div
      v-if="openrouterApiModel === 'custom'"
      class="setting-group"
    >
      <label>{{ $i18n('openrouter_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openrouterCustomModel"
        :placeholder="$i18n('openrouter_custom_model_placeholder') || 'Enter custom model name (e.g., provider/model-name)'"
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

const openrouterApiKey = computed({
  get: () => settingsStore.settings?.OPENROUTER_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENROUTER_API_KEY', value)
})

const openrouterApiModel = computed({
  get: () => settingsStore.settings?.OPENROUTER_API_MODEL || 'openai/gpt-4o',
  set: (value) => {
    if (value === 'custom') {
      // Handled by openrouterCustomModel's setter
    } else {
      settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value)
    }
  }
})

const openrouterCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.OPENROUTER_API_MODEL;
    const isPredefined = openrouterApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('OPENROUTER_API_MODEL', value);
  }
})

const openrouterApiModelOptions = ref([
  { value: 'openai/gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o Mini' },
  { value: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1' },
  { value: 'openai/gpt-4.1-mini', label: 'OpenAI GPT-4.1 Mini' },
  { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet' },
  { value: 'anthropic/claude-3.5-haiku', label: 'Claude 3.5 Haiku' },
  { value: 'google/gemini-2.5-pro', label: 'Google Gemini 2.5 Pro' },
  { value: 'google/gemini-2.5-flash', label: 'Google Gemini 2.5 Flash' },
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Meta Llama 3.3 70B' },
  { value: 'mistralai/mistral-large', label: 'Mistral Large' },
  { value: 'custom', label: 'Custom Model' }
])
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
