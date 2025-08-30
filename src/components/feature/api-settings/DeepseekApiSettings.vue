<template>
  <div>
  <h3>{{ t('deepseek_api_settings_title') || 'DeepSeek API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('deepseek_api_key_info') || 'Get your DeepSeek API key from' }}
      </span>
      <a
        class="api-link"
        href="https://platform.deepseek.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
      >
  {{ t('deepseek_api_key_link') || 'Get DeepSeek API Key' }}
      </a>
    </div>
    <div class="setting-group">
  <label>{{ t('custom_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="deepseekApiKey"
        type="password"
  :placeholder="t('deepseek_api_key_placeholder') || 'Paste your DeepSeek API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
  <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="deepseekApiModel"
  :options="deepseekApiModelOptions"
        class="model-select"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
  <label>{{ t('deepseek_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="deepseekCustomModel"
  :placeholder="t('deepseek_custom_model_placeholder') || 'Enter custom model name'"
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

const { t } = useI18n()

const settingsStore = useSettingsStore()

const deepseekApiKey = computed({
  get: () => settingsStore.settings?.DEEPSEEK_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPSEEK_API_KEY', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('deepseek-chat')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL || 'deepseek-chat';
  const isPredefined = deepseekApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const deepseekApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('DEEPSEEK_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const deepseekCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.DEEPSEEK_API_MODEL || 'deepseek-chat';
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

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/_api-settings-common.scss' as *;
</style>
