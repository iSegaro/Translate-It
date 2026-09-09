<template>
  <div class="custom-settings">
    <div class="api-info">
      <h3>{{ t('custom_api_settings_title') || 'Custom OpenAI Compatible Settings' }}</h3>
      <p class="setting-description">
        {{ t('custom_api_settings_description') || 'Use any service that is compatible with the OpenAI chat completions format.' }}
      </p>
    </div>
    <div class="setting-group vertical">
      <label>{{ t('custom_api_settings_api_url_label') || 'API URL' }}</label>
      <BaseInput
        id="CUSTOM_API_URL"
        v-model="customApiUrl"
        :placeholder="t('custom_api_url_placeholder') || '(e.g., v1/chat/completions)'"
        class="api-url-input"
        dir="ltr"
      />
      <p class="setting-help-text">
        {{ t('custom_api_url_example') || 'Example:' }} https://openai.com/v1/chat/completions
      </p>
    </div>
    <ApiKeyInput
      id="CUSTOM_API_KEY"
      v-model="customApiKey"
      :label="t('custom_api_settings_api_key_label') || 'API Keys'"
      :placeholder="t('custom_api_key_placeholder') || 'Enter your API keys (one per line)'"
      :provider-id="ProviderRegistryIds.CUSTOM"
      :testing="testingKeys"
      :test-result="testResult"
      :allow-empty-test="true"
      @test="testKeys"
    />
    <div class="setting-group vertical">
      <label>{{ t('custom_api_settings_model_label') || 'Model' }}</label>
      <BaseInput
        v-model="customApiModel"
        :placeholder="t('custom_api_model_placeholder') || 'Enter the model name'"
        class="model-select"
        dir="ltr"
      />
    </div>
    <div class="setting-group vertical">
      <div class="api-key-input-wrapper">
        <div class="button-result-row">
          <div
            data-testid="custom-connection-status"
            :class="connectionReport ? ['test-result', connectionResultClass] : 'setting-help-text'"
          >
            {{ connectionStatusText }}
          </div>
          <button
            type="button"
            class="test-keys-button"
            :class="{ 'testing-keys': testingConnection }"
            data-testid="custom-test-connection"
            @click="testConnection"
          >
            {{ testingConnection ? t('custom_api_testing_connection') : t('custom_api_test_connection') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import "./CustomApiSettings.scss"
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseInput from '@/components/base/BaseInput.vue'
import ApiKeyInput from './ApiKeyInput.vue'
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js'
import { ProviderRegistryIds } from '@/features/translation/providers/ProviderConstants.js'
import { useExtensionAPI } from '@/composables/core/useExtensionAPI.js'
import { storageManager } from '@/shared/storage/core/StorageCore.js'
import { presentProviderSettingsError } from '@/features/settings/presentation/ProviderSettingsErrorPresenter.js'

const { t } = useI18n()

const settingsStore = useSettingsStore()
const { testCustomConnection } = useExtensionAPI()

const customApiUrl = computed({
  get: () => settingsStore.settings?.CUSTOM_API_URL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_URL', value)
})

const customApiKey = computed({
  get: () => settingsStore.settings?.CUSTOM_API_KEY || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_KEY', value)
})

const customApiModel = computed({
  get: () => settingsStore.settings?.CUSTOM_API_MODEL || '',
  set: (value) => settingsStore.updateSettingLocally('CUSTOM_API_MODEL', value)
})

// Test Connection functionality: explicit click only, never on mount/save,
// never gates Save, never persists. Local status only.
const testingConnection = ref(false)
const connectionReport = ref(null)
// All keys below are guaranteed by locale policy (en reference + sync);
// no translation fallbacks are used for missing keys.
const connectionStatusText = computed(() => {
  if (testingConnection.value) return t('custom_api_testing_connection')
  if (!connectionReport.value) return t('custom_api_not_tested')
  const { messageKey, params } = connectionReport.value
  return params ? t(messageKey, params) : t(messageKey)
})
// Presentation: success only when usable, structured-supported, and the
// served model matches; any proven mismatch warns even when usable;
// unsupported/inconclusive protocol on usable reports warns; any unusable
// report or failure is an error.
const connectionResultClass = computed(() => {
  const report = connectionReport.value
  if (!report || !report.usable) return 'error'
  if (report.responseFormat === 'supported' && report.modelStatus !== 'mismatch') return 'success'
  return 'warning'
})
let connectionGeneration = 0
let connectionOperationCounter = 0

const createConnectionOperationId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the local fallback below.
  }
  connectionOperationCounter += 1
  return `compat-${Date.now().toString(36)}-${connectionOperationCounter}`
}

// Stable identity for this component instance, generated once at setup —
// never per check. Background keys supersede/cancel scoping on it, so two
// options.html instances never collide even though they share a sender URL.
// Operation ids stay unique per check; only the caller id is stable.
const connectionCallerId = createConnectionOperationId()

const testConnection = async () => {
  // Snapshot unsaved form values so a later edit (config B) can never be
  // mislabeled by this run's resolution. The probe itself executes in
  // background (same runtime as CustomProvider's capability cache); this
  // context only sends the snapshot and renders the returned report. The
  // per-check operation id lets background correlate (supersede/timeout)
  // without touching translation message lifecycles.
  const snapshot = {
    url: customApiUrl.value,
    model: customApiModel.value,
    key: ApiKeyManager.parseKeys(customApiKey.value)[0] ?? ''
  }
  const generation = ++connectionGeneration
  testingConnection.value = true
  connectionReport.value = null

  try {
    const response = await testCustomConnection({
      apiUrl: snapshot.url,
      apiModel: snapshot.model,
      apiKey: snapshot.key,
      operationId: createConnectionOperationId(),
      callerId: connectionCallerId
    })
    const report = response?.data?.report
    if (!report || typeof report.messageKey !== 'string') {
      throw new Error('Custom connection probe returned no report')
    }
    if (generation !== connectionGeneration) return
    const currentKey = ApiKeyManager.parseKeys(customApiKey.value)[0] ?? ''
    if (
      customApiUrl.value !== snapshot.url ||
      customApiModel.value !== snapshot.model ||
      currentKey !== snapshot.key
    ) {
      return
    }
    connectionReport.value = report
  } catch {
    if (generation !== connectionGeneration) return
    connectionReport.value = {
      fallbackStructured: 'unknown',
      responseFormat: 'unknown',
      usable: false,
      state: 'request_failed',
      messageKey: 'custom_api_connection_failed_unexpected',
      params: null,
      modelStatus: 'unknown',
      requestedModel: snapshot.model.trim() ? snapshot.model.trim() : null,
      effectiveModel: null
    }
  } finally {
    if (generation === connectionGeneration) testingConnection.value = false
  }
}

// Any edit invalidates the report back to Not tested and stales in-flight
// runs; prior capability cache entries are retained (never deleted here).
// Sync flush so an edit can never be reordered behind a subsequent click.
// An edit also cancels the active background check for this caller so a
// stale config never burns a full probe deadline; harmless when no check is
// in flight. Save gating and Test Key behavior are untouched.
watch([customApiUrl, customApiModel, customApiKey], () => {
  const hadActiveCheck = testingConnection.value
  connectionGeneration++
  testingConnection.value = false
  connectionReport.value = null
  if (hadActiveCheck) {
    testCustomConnection({ cancel: true, callerId: connectionCallerId }).catch(() => undefined)
  }
}, { flush: 'sync' })

// Test keys functionality
const testingKeys = ref(false)
const testResult = ref(null)

const testKeys = async (providerId) => {
  testingKeys.value = true
  testResult.value = null

  try {
    // If URL is empty, get from storage and update the field
    let testApiUrl = customApiUrl.value

    if (!testApiUrl || testApiUrl.trim() === '') {
      // Read directly from storage (same as ApiKeyManager does)
      const settings = await storageManager.get({
        CUSTOM_API_URL: '',
        CUSTOM_API_MODEL: ''
      })
      const storedUrl = settings.CUSTOM_API_URL || ''

      if (storedUrl && storedUrl.trim() !== '') {
        testApiUrl = storedUrl
        // Update the field to show the stored URL (triggers computed setter)
        customApiUrl.value = storedUrl
      }
    }

    // Test keys directly from textbox value, passing current URL and Model context
    const result = await ApiKeyManager.testKeysDirect(
      customApiKey.value,
      providerId,
      {
        apiUrl: testApiUrl,
        apiModel: customApiModel.value
      }
    )

    // Store messageKey and params for reactive translation in ApiKeyInput
    testResult.value = {
      allInvalid: result.allInvalid,
      messageKey: result.messageKey,
      params: result.params,
      reorderedString: result.reorderedString
    }

    // Update the local value with the reordered keys
    if (!result.allInvalid && result.reorderedString) {
      settingsStore.updateSettingLocally('CUSTOM_API_KEY', result.reorderedString)
    }
  } catch (error) {
    testResult.value = {
      allInvalid: true,
      ...presentProviderSettingsError(error)
    }
  } finally {
    testingKeys.value = false
  }
}
</script>
