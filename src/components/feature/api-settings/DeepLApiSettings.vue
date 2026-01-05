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
      <div class="label-with-toggle">
        <label>{{ t('deepl_api_key_label') || 'API Keys' }}</label>
        <button
          type="button"
          class="toggle-visibility-button"
          @click="togglePasswordVisibility"
          :title="passwordVisible ? 'Hide' : 'Show'"
        >
          <img
            v-if="!passwordVisible"
            :src="eyeIcon"
            alt="Show"
            class="toggle-icon"
            width="16"
            height="16"
          >
          <img
            v-else
            :src="eyeHideIcon"
            alt="Hide"
            class="toggle-icon"
            width="16"
            height="16"
          >
        </button>
      </div>
      <div class="api-key-input-wrapper">
        <BaseTextarea
          ref="textareaRef"
          v-model="deeplApiKey"
          :placeholder="t('deepl_api_key_placeholder') || 'Enter your API keys (one per line)'"
          :rows="3"
          class="api-key-textarea"
          :password-mask="true"
          :hide-toggle="true"
        />
        <button
          @click="testKeys"
          :disabled="testingKeys || !hasKeys"
          class="test-keys-button"
          :class="{ 'testing-keys': testingKeys }"
        >
          {{ testingKeys ? 'Testing...' : 'Test Keys' }}
        </button>
      </div>
      <div v-if="testResult" class="test-result" :class="testResult.allInvalid ? 'error' : 'success'">
        {{ testResult.message }}
      </div>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { CONFIG } from '@/shared/config/config.js'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import { useRTLSelect } from '@/composables/ui/useRTLSelect.js'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import eyeIcon from '@/icons/ui/eye-open.svg?url'
import eyeHideIcon from '@/icons/ui/eye-hide.svg?url'

const { t } = useI18n()
const { rtlSelectStyle } = useRTLSelect()

const settingsStore = useSettingsStore()
const textareaRef = ref(null)
const passwordVisible = ref(false)

const deeplApiKey = computed({
  get: () => settingsStore.settings?.DEEPL_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('DEEPL_API_KEY', value)
})

const hasKeys = computed(() => {
  return deeplApiKey.value.trim().length > 0
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

const testKeys = async () => {
  if (!hasKeys.value) return

  testingKeys.value = true
  testResult.value = null

  try {
    // Test keys directly from textbox value (not from storage)
    const result = await ApiKeyManager.testKeysDirect(deeplApiKey.value, 'DeepL')

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

// Toggle password visibility
const togglePasswordVisibility = () => {
  if (textareaRef.value) {
    textareaRef.value.toggleVisibility()
    passwordVisible.value = textareaRef.value.visibilityVisible
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

.label-with-toggle {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-sm;
  gap: $spacing-sm;

  label {
    margin-bottom: 0;
    flex: 1;
  }

  .toggle-visibility-button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: opacity var(--transition-base, 0.2s);
    flex-shrink: 0;

    &:hover {
      opacity: 1;
    }

    .toggle-icon {
      display: block;
      pointer-events: none;
      width: 16px;
      height: 16px;
      object-fit: contain;
    }
  }
}

.api-key-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .api-key-textarea {
    width: 100%;
  }

  .test-keys-button {
    align-self: flex-end;
    padding: 8px 16px;
    background-color: var(--color-primary, #1976d2);
    color: white;
    border: none;
    border-radius: var(--border-radius-base, 4px);
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-base, 0.2s);

    &:hover:not(:disabled) {
      background-color: var(--color-primary-dark, #1565c0);
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    &.testing-keys {
      opacity: 0.8;
      cursor: wait;
    }
  }
}

.test-result {
  margin-top: 8px;
  padding: 8px 12px;
  border-radius: var(--border-radius-base, 4px);
  font-size: 14px;

  &.success {
    background-color: var(--color-success-bg, #e8f5e9);
    color: var(--color-success-text, #2e7d32);
  }

  &.error {
    background-color: var(--color-error-bg, #ffebee);
    color: var(--color-error-text, #c62828);
  }
}
</style>
