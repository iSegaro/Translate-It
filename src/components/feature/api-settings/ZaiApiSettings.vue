<template>
  <div>
    <h3>{{ t('zai_api_settings_title') || 'Z.AI GLM API Settings' }}</h3>
    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('zai_api_key_info') || 'You can get your Z.AI API key from:' }}
      </span>
      <div class="api-link-container">
        <div class="api-link-item">
          <a
            class="api-link primary-link"
            href="https://z.ai/manage-apikey/apikey-list"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('zai_api_key_international_link') || 'Get Your API Key (International)' }}
          </a>
          <span class="api-link-info">
            {{ t('zai_api_key_international_site') || 'For international users' }}
          </span>
        </div>
        <div class="api-link-item">
          <a
            class="api-link primary-link"
            href="https://open.bigmodel.cn/"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ t('zai_api_key_china_link') || 'Get Your API Key (China)' }}
          </a>
          <span class="api-link-info">
            {{ t('zai_api_key_china_site') || 'For users in China' }}
          </span>
        </div>
      </div>
    </div>
    <div class="setting-group">
      <label>{{ t('zai_api_settings_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="zaiApiKey"
        type="password"
        :placeholder="t('zai_api_key_placeholder') || 'Paste your Z.AI API key here'"
        class="api-key-input"
      />
    </div>
    <div class="setting-group">
      <label>{{ t('PROVIDER_MODEL_LABEL') || 'Model' }}</label>
      <BaseSelect
        v-model="zaiApiModel"
        :options="zaiApiModelOptions"
        class="model-select"
        :style="rtlSelectStyle"
      />
    </div>
    <div
      v-if="selectedModelOption === 'custom'"
      class="setting-group"
    >
      <label>{{ t('zai_custom_model_label') || 'Custom Model Name' }}</label>
      <BaseInput
        v-model="zaiCustomModel"
        :placeholder="t('zai_custom_model_placeholder') || 'Enter custom model name'"
        class="custom-model-input"
      />
      <span class="setting-description">
        {{ t('zai_custom_model_info') || 'Enter the exact model name as provided by Z.AI' }}
      </span>
    </div>
    <div class="setting-group">
      <label>{{ t('zai_api_settings_api_url_label') || 'API URL' }}</label>
      <BaseInput
        v-model="zaiApiUrl"
        :placeholder="t('zai_api_url_placeholder') || 'Default Z.AI API URL'"
        class="api-url-input"
      />
      <span class="setting-description">
        {{ t('zai_api_url_info') || 'Leave empty to use the default Z.AI API endpoint' }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const zaiApiKey = computed({
  get: () => settingsStore.settings?.ZAI_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('ZAI_API_KEY', value)
})

const zaiApiUrl = computed({
  get: () => settingsStore.settings?.ZAI_API_URL || CONFIG.ZAI_API_URL,
  set: (value) => settingsStore.updateSettingLocally('ZAI_API_URL', value)
})

// Track dropdown selection separately from stored value
const selectedModelOption = ref('glm-4.5-air')

// Initialize selectedModelOption based on current stored value
const initializeModelSelection = () => {
  const currentModel = settingsStore.settings?.ZAI_API_MODEL || 'glm-4.5-air';
  const isPredefined = zaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
  selectedModelOption.value = isPredefined ? currentModel : 'custom';
}

const zaiApiModel = computed({
  get: () => selectedModelOption.value,
  set: (value) => {
    selectedModelOption.value = value;
    if (value !== 'custom') {
      settingsStore.updateSettingLocally('ZAI_API_MODEL', value)
    }
    // If 'custom' is selected, wait for user input in custom field
  }
})

const zaiCustomModel = computed({
  get: () => {
    const currentModel = settingsStore.settings?.ZAI_API_MODEL || 'glm-4.5-air';
    const isPredefined = zaiApiModelOptions.value.some(option => option.value === currentModel && option.value !== 'custom');
    return isPredefined ? '' : currentModel;
  },
  set: (value) => {
    settingsStore.updateSettingLocally('ZAI_API_MODEL', value);
  }
})

// Get model options from CONFIG to maintain consistency
const zaiApiModelOptions = ref(
  CONFIG.ZAI_MODELS?.map(model => ({
    value: model.value,
    label: model.name
  })) || [
    { value: 'glm-4.5-air', label: 'GLM-4.5-Air' },
    { value: 'glm-4.5', label: 'GLM-4.5' },
    { value: 'glm-4.6', label: 'GLM-4.6' },
    { value: 'custom', label: 'Custom Model' }
  ]
)

// Initialize model selection on mount
onMounted(() => {
  initializeModelSelection()
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;

.api-link-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.api-link-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.api-link-info {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-weight: 500;
  opacity: 0.8;
}

.primary-link {
  font-weight: 600;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}
</style>