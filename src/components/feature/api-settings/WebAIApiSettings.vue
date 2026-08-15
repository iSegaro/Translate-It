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
      <BaseSelect
        v-model="webAIApiModel"
        class="model-select"
        :options="webAIApiModelOptions"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group vertical"
    >
      <label>{{ t('custom_api_settings_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="webAIApiCustomModel"
        :placeholder="t('custom_api_model_placeholder') || 'Enter custom model name'"
        class="model-select"
        dir="ltr"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import "./WebAIApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { REPO_URLS } from '@/shared/constants/core.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const webAIApiUrl = computed({
  get: () => settingsStore.settings?.WEBAI_API_URL || CONFIG.WEBAI_API_URL,
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_URL', value)
})

const selectedModelOption = ref(CONFIG.WEBAI_API_MODEL)

const webAIApiModelOptions = computed(() => {
  const models = settingsStore.settings?.WEBAI_MODELS || CONFIG.WEBAI_MODELS || []
  return models.map(model => ({
    value: model.value,
    label: model.name || model.value
  }))
})

const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
  const isPredefined = webAIApiModelOptions.value.some(
    option => option.value === currentModel && option.value !== 'custom'
  )
  selectedModelOption.value = isPredefined ? currentModel : 'custom'
}

const webAIApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('WEBAI_API_MODEL', value)
    }
  }
})

const webAIApiCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.WEBAI_API_MODEL || CONFIG.WEBAI_API_MODEL
    const isPredefined = webAIApiModelOptions.value.some(
      option => option.value === currentModel && option.value !== 'custom'
    )
    return isPredefined ? '' : currentModel
  },
  set: (value) => settingsStore.updateSettingLocally('WEBAI_API_MODEL', value)
})

onMounted(() => {
  initializeModelSelection()
})
</script>
