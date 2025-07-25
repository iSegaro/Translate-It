<template>
  <div>
    <h3>{{ $i18n('gemini_api_settings_title') || 'Gemini API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ $i18n('gemini_api_key_info') || 'You can get your Gemini API key from' }}
      </span>
      <a
        class="api-link"
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ $i18n('gemini_api_key_link') || 'Get Your Free API Key' }}
      </a>
    </div>
    <div class="setting-group">
      <label>{{ $i18n('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="geminiApiKey"
        type="password"
        :placeholder="$i18n('gemini_api_key_placeholder') || 'Paste your API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
      <label>{{ $i18n('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseDropdown
        v-model="geminiModel"
        :options="geminiModelOptions"
        class="model-select"
      />
    </div>
    <div v-if="geminiModel !== 'custom'" class="setting-group">
      <label>{{ $i18n('gemini_thinking_label') || 'Enable Thinking Mode' }}</label>
      <BaseCheckbox v-model="geminiThinking" />
      <span class="setting-description">
        {{ $i18n('gemini_thinking_description') || 'Allow the model to think step-by-step before responding.' }}
      </span>
    </div>
    <div v-if="geminiModel === 'custom'" class="setting-group">
      <label>{{ $i18n('gemini_api_url_label') || 'API URL' }}</label>
      <BaseInput
        v-model="geminiCustomUrl"
        :placeholder="$i18n('gemini_api_url_placeholder') || 'Enter API URL'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseDropdown from '@/components/base/BaseDropdown.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'

const settingsStore = useSettingsStore()

const geminiApiKey = computed({
  get: () => settingsStore.settings?.API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('API_KEY', value)
})

const geminiModel = computed({
  get: () => settingsStore.settings?.GEMINI_MODEL || 'gemini-2.5-flash',
  set: (value) => settingsStore.updateSettingLocally('GEMINI_MODEL', value)
})

const geminiThinking = computed({
  get: () => settingsStore.settings?.GEMINI_THINKING_ENABLED || false,
  set: (value) => settingsStore.updateSettingLocally('GEMINI_THINKING_ENABLED', value)
})

const geminiCustomUrl = computed({
  get: () => settingsStore.settings?.API_URL || '',
  set: (value) => settingsStore.updateSettingLocally('API_URL', value)
})

const geminiModelOptions = ref([
  { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite-preview', label: 'Gemini 2.5 Flash-Lite Preview' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
  { value: 'custom', label: 'Custom URL' }
])
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
