<template>
  <div>
  <h3>{{ t('openai_api_settings_title') || 'OpenAI API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('openai_api_key_info') || 'Get your OpenAI API key from' }}
      </span>
      <a
        class="api-link"
        href="https://platform.openai.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
  {{ t('openai_api_key_link') || 'Get OpenAI API Key' }}
      </a>
    </div>
    <div class="setting-group">
  <label>{{ t('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="openaiApiKey"
        type="password"
  :placeholder="t('openai_api_key_placeholder') || 'Paste your OpenAI API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
  <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="openaiApiModel"
        :options="openaiApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
  <label>{{ t('openai_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="openaiCustomModel"
  :placeholder="t('openai_custom_model_placeholder') || 'Enter custom model name'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/store/core/settings'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useRTLSelect } from '@/composables/useRTLSelect.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const openaiApiKey = computed({
  get: () => settingsStore.settings?.OPENAI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('OPENAI_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('gpt-4o')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.OPENAI_API_MODEL || 'gpt-4o';
  const isPredefined = openaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const openaiApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('OPENAI_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const openaiCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.OPENAI_API_MODEL || 'gpt-4o';
    const isPredefined = openaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('OPENAI_API_MODEL', value);
  }
})

const openaiApiModelOptions = ref([
  { value: 'gpt-5', label: 'GPT-5' },
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5-nano', label: 'GPT-5 Nano' },
  { value: 'gpt-4.1', label: 'GPT-4.1' },
  { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
  { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  { value: 'custom', label: 'Custom Model' }
])

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
