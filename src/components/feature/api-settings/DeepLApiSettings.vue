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

    <ApiKeyInput
      v-model="deeplApiKey"
      :label="t('deepl_api_key_label') || 'API Keys'"
      :placeholder="t('deepl_api_key_placeholder') || 'Enter your API keys (one per line)'"
      provider-name="DeepL"
      :testing="testingKeys"
      :test-result="testResult"
      @test="testKeys"
    />

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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'

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

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerName) => {
  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(deeplApiKey.value, providerName)

    // Build translated message from messageKey and params
    const message = result.messageKey
      ? (result.params ? t(result.messageKey, result.params) : t(result.messageKey))
      : null

    testResult.value = {
      ...result,
      message
    }

    // Update the local value with the reordered keys
    if (!result.allInvalid && result.reorderedString) {
      settingsStore.updateSettingLocally('DEEPL_API_KEY', result.reorderedString)
    }
  } catch (error) {
    testResult.value = {
      message: t('api_test_failed', { error: error.message }),
      allInvalid: true
    }
  } finally {
    testingKeys.value = false
  }
}

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
