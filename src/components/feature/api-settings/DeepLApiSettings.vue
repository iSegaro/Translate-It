<template>
  <div class="deepl-settings">
    <h3>{{ t('deepl_api_settings_title') || 'DeepL API Settings' }}</h3>

    <div class="setting-group api-key-info">
      <span class="setting-description">
        {{ t('deepl_api_key_info') || 'You can get your DeepL API key from' }}
      </span>
      <a
        class="api-link"
        href="https://www.deepl.com/en/your-account/keys"
        target="_blank"
        rel="noopener noreferrer"
      >
        {{ t('deepl_api_key_link') || 'DeepL API' }}
      </a>
      <span class="setting-description">
        {{ t('deepl_free_api_info') || 'Free tier available with 500,000 characters/month.' }}
      </span>
    </div>

    <div class="setting-group">
      <label>{{ t('deepl_api_key_label') || 'API Key' }}</label>
      <BaseInput
        v-model="deeplApiKey"
        type="password"
        :placeholder="t('deepl_api_key_placeholder') || 'Paste your DeepL API key here'"
        class="api-key-input"
      />
    </div>

    <div class="setting-group">
      <label>{{ t('deepl_api_tier_label') || 'API Tier' }}</label>
      <BaseSelect
        v-model="deeplApiTier"
        :options="deeplApiTierOptions"
        class="tier-select"
        :style="rtlSelectStyle"
      />
      <span class="setting-description">{{ tierDescription }}</span>
    </div>

    <div class="setting-group">
      <BaseCheckbox
        v-model="deeplBetaLanguagesEnabled"
        :label="t('deepl_beta_languages_label') || 'Enable Beta Languages'"
      />
      <span class="setting-description">
        {{ t('deepl_beta_languages_description') || 'Enable support for beta languages. Beta languages do not support formality settings.' }}
      </span>
    </div>

    <div class="setting-group">
      <label>{{ t('deepl_formality_label') || 'Translation Formality' }}</label>
      <BaseSelect
        v-model="deeplFormality"
        :options="deeplFormalityOptions"
        class="formality-select"
        :style="rtlSelectStyle"
        :disabled="deeplBetaLanguagesEnabled"
      />
      <span class="setting-description">
        {{ t('deepl_formality_description') || 'Control the formality level of translations. Some languages may not support all options.' }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()

const deeplApiKey = computed({
  get: () => settingsStore.settings?.DEEPL_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPL_API_KEY', value)
})

const deeplApiTier = computed({
  get: () => settingsStore.settings?.DEEPL_API_TIER || 'free',
  set: (value) => settingsStore.updateSettingLocally('DEEPL_API_TIER', value)
})

const deeplFormality = computed({
  get: () => settingsStore.settings?.DEEPL_FORMALITY || 'default',
  set: (value) => settingsStore.updateSettingLocally('DEEPL_FORMALITY', value)
})

const deeplBetaLanguagesEnabled = computed({
  get: () => settingsStore.settings?.DEEPL_BETA_LANGUAGES_ENABLED ?? true,
  set: (value) => settingsStore.updateSettingLocally('DEEPL_BETA_LANGUAGES_ENABLED', value)
})

const deeplApiTierOptions = computed(() =>
  CONFIG.DEEPL_API_TIER_OPTIONS?.map(option => ({
    value: option.value,
    label: t(option.i18nKey) || option.i18nKey
  })) || []
)

const deeplFormalityOptions = computed(() =>
  CONFIG.DEEPL_FORMALITY_OPTIONS?.map(option => ({
    value: option.value,
    label: t(option.i18nKey) || option.i18nKey
  })) || []
)

const tierDescription = computed(() => {
  const tier = deeplApiTier.value
  if (tier === 'free') {
    return t('deepl_free_tier_description') ||
      'Free API endpoint with 500,000 characters/month limit. Uses api-free.deepl.com'
  }
  return t('deepl_pro_tier_description') ||
    'Pro API endpoint with higher limits based on your subscription. Uses api.deepl.com'
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/components/api-settings-common" as *;
</style>
