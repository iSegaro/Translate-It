<template>
  <div>
  <h3>{{ t('gemini_api_settings_title') || 'Gemini API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('gemini_api_key_info') || 'You can get your Gemini API key from' }}
      </span>
      <a
        class="api-link"
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noopener noreferrer"
      >
  {{ t('gemini_api_key_link') || 'Get Your Free API Key' }}
      </a>
    </div>
    <div class="setting-group">
  <label>{{ t('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="geminiApiKey"
        type="password"
  :placeholder="t('gemini_api_key_placeholder') || 'Paste your API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
  <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="geminiModel"
        :options="geminiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="geminiModel !== 'custom' && isThinkingSupported"
      class="setting-group"
    >
      <BaseCheckbox 
        v-model="geminiThinking" 
        :disabled="!isThinkingControllable"
  :label="t('gemini_thinking_label') || 'Enable Thinking Mode'"
      />
      <span class="setting-description">
  {{ t('gemini_thinking_description') || thinkingDescription }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/store/core/settings'
import { CONFIG } from '@/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import { useRTLSelect } from '@/composables/useRTLSelect.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

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
  get: () => settingsStore.settings?.GEMINI_THINKING_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('GEMINI_THINKING_ENABLED', value)
})

// const geminiCustomUrl = computed({
//   get: () => settingsStore.settings?.API_URL || '',
//   set: (value) => settingsStore.updateSettingLocally('API_URL', value)
// })

// Get model options from CONFIG to maintain consistency
const geminiModelOptions = ref(
  CONFIG.GEMINI_MODELS?.map(model => ({
    value: model.value,
    label: model.name
  })) || [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.5-flash-lite-preview', label: 'Gemini 2.5 Flash-Lite Preview' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash-Lite' },
    { value: 'custom', label: 'Custom URL' }
  ]
)

// Track thinking mode properties for current model
const isThinkingSupported = ref(false)
const isThinkingControllable = ref(true)
const thinkingDescription = ref('Allow the model to think step-by-step before responding.')

// Watch for model changes to update thinking mode availability
watch(geminiModel, (newModel) => {
  const modelConfig = CONFIG.GEMINI_MODELS?.find(model => model.value === newModel)
  if (modelConfig && modelConfig.thinking) {
    const { supported, controllable, defaultEnabled } = modelConfig.thinking
    
    isThinkingSupported.value = supported
    
    if (supported) {
      isThinkingControllable.value = controllable
      
      // Update description based on model
      if (newModel === 'gemini-2.5-pro' && !controllable) {
        thinkingDescription.value = 'Thinking mode is always enabled for Gemini 2.5 Pro and cannot be disabled.'
      } else {
        thinkingDescription.value = 'Allow the model to think step-by-step before responding.'
      }
      
      // Set default value for non-controllable models
      if (!controllable) {
        geminiThinking.value = defaultEnabled
      }
    }
  } else {
    // For unknown models or those without thinking support
    isThinkingSupported.value = false
    isThinkingControllable.value = false
  }
}, { immediate: true })
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
