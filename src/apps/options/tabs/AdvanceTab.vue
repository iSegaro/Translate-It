<template>
  <section class="advance-tab">
    <h2>{{ t('advance_section_title') || 'Advanced Settings' }}</h2>
    
    <div class="setting-group">
      <BaseCheckbox
        v-model="useMock"
        :label="t('advance_dev_api_mode_label') || 'Use Dev API Mode'"
      />
    </div>
    
    <div class="setting-group">
      <BaseCheckbox
        v-model="debugMode"
        :label="t('advance_debug_mode_label') || 'Debug Mode'"
      />
    </div>
    
    <div class="setting-group">
      <label>{{ t('excluded_sites_label') || 'Exclude these sites (comma separated)' }}</label>
      <BaseTextarea
        v-model="excludedSites"
        :rows="3"
        placeholder="example.com, anotherdomain.org"
        dir="ltr"
        class="excluded-sites-input"
      />
    </div>

    <!-- Proxy Settings Section -->
    <div class="setting-section proxy-section">
      <h3>{{ t('proxy_section_title') || 'Proxy Settings' }}</h3>
      <p class="section-description">
        {{ t('proxy_section_description') || 'Configure proxy settings for providers with geographical restrictions (e.g., Gemini from Iran)' }}
      </p>
      
      <div class="setting-group">
        <BaseCheckbox
          v-model="proxyEnabled"
          :label="t('proxy_enabled_label') || 'Enable Proxy'"
        />
      </div>

      <template v-if="proxyEnabled">
        <div class="setting-group">
          <label>{{ t('proxy_type_label') || 'Proxy Type' }}</label>
          <BaseSelect
            v-model="proxyType"
            :options="proxyTypeOptions"
            class="proxy-select"
          />
        </div>

        <div class="setting-group proxy-connection">
          <div class="proxy-input-group">
            <label>{{ t('proxy_host_label') || 'Host' }}</label>
            <BaseInput
              v-model="proxyHost"
              placeholder="proxy.example.com"
              dir="ltr"
              class="proxy-input"
            />
          </div>

          <div class="proxy-input-group">
            <label>{{ t('proxy_port_label') || 'Port' }}</label>
            <BaseInput
              v-model="proxyPort"
              type="number"
              placeholder="8080"
              min="1"
              max="65535"
              dir="ltr"
              class="proxy-input proxy-port"
            />
          </div>
        </div>

        <div class="setting-group proxy-auth">
          <div class="proxy-input-group">
            <label>{{ t('proxy_username_label') || 'Username (Optional)' }}</label>
            <BaseInput
              v-model="proxyUsername"
              placeholder=""
              dir="ltr"
              class="proxy-input"
            />
          </div>

          <div class="proxy-input-group">
            <label>{{ t('proxy_password_label') || 'Password (Optional)' }}</label>
            <BaseInput
              v-model="proxyPassword"
              type="password"
              placeholder=""
              dir="ltr"
              class="proxy-input"
            />
          </div>
        </div>

        <div class="setting-group proxy-test">
          <button
            :disabled="isTestingProxy || !canTestProxy"
            :class="['test-button', testResultClass]"
            @click="testProxyConnection"
          >
            <span v-if="isTestingProxy" class="button-content">
              <div class="spinner"></div>
              {{ t('proxy_testing') || 'Testing...' }}
            </span>
            <span v-else class="button-content">
              {{ testButtonText }}
            </span>
          </button>

          <div v-if="testResult" :class="['test-result', testResult.success ? 'success' : 'error']">
            {{ testResult.message }}
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'

import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()

const { t } = useI18n()

// Advanced settings
const useMock = computed({
  get: () => settingsStore.settings?.USE_MOCK || false,
  set: (value) => settingsStore.updateSettingLocally('USE_MOCK', value)
})

const debugMode = computed({
  get: () => settingsStore.settings?.DEBUG_MODE || false,
  set: (value) => settingsStore.updateSettingLocally('DEBUG_MODE', value)
})

const excludedSites = computed({
  get: () => {
    const sites = settingsStore.settings?.EXCLUDED_SITES || []
    return Array.isArray(sites) ? sites.join(', ') : sites
  },
  set: (value) => {
    const sites = value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    settingsStore.updateSettingLocally('EXCLUDED_SITES', sites)
  }
})

// Proxy settings
const proxyEnabled = computed({
  get: () => settingsStore.settings?.PROXY_ENABLED || false,
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_ENABLED', value)
})

const proxyType = computed({
  get: () => settingsStore.settings?.PROXY_TYPE || 'http',
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_TYPE', value)
})

const proxyHost = computed({
  get: () => settingsStore.settings?.PROXY_HOST || '',
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_HOST', value)
})

const proxyPort = computed({
  get: () => settingsStore.settings?.PROXY_PORT || 8080,
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_PORT', parseInt(value) || 8080)
})

const proxyUsername = computed({
  get: () => settingsStore.settings?.PROXY_USERNAME || '',
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_USERNAME', value)
})

const proxyPassword = computed({
  get: () => settingsStore.settings?.PROXY_PASSWORD || '',
  set: (value) => settingsStore.updateSettingAndPersist('PROXY_PASSWORD', value)
})

// Proxy test functionality
const isTestingProxy = ref(false)
const testResult = ref(null)

const proxyTypeOptions = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks', label: 'SOCKS' }
]

const canTestProxy = computed(() => {
  return proxyHost.value && proxyPort.value && proxyType.value
})

const testResultClass = computed(() => {
  if (!testResult.value) return ''
  return testResult.value.success ? 'success' : 'error'
})

const testButtonText = computed(() => {
  if (!proxyEnabled.value) {
    return t('proxy_test_direct') || 'Test Direct Connection'
  }
  return t('proxy_test_proxy') || 'Test Proxy Connection'
})

const testProxyConnection = async () => {
  if (isTestingProxy.value) return

  isTestingProxy.value = true
  testResult.value = null

  try {
    // Import the proxy manager
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js')

    // Update proxy configuration
    if (proxyEnabled.value) {
      proxyManager.setConfig({
        enabled: proxyEnabled.value,
        type: proxyType.value,
        host: proxyHost.value,
        port: proxyPort.value,
        auth: {
          username: proxyUsername.value,
          password: proxyPassword.value
        }
      })
    } else {
      proxyManager.setConfig({ enabled: false })
    }

    // Test the connection
    const success = await proxyManager.testConnection()

    testResult.value = {
      success,
      message: success
        ? (proxyEnabled.value
            ? (t('proxy_test_success') || 'Proxy connection successful!')
            : (t('direct_test_success') || 'Direct connection successful!'))
        : (proxyEnabled.value
            ? (t('proxy_test_failed') || 'Proxy connection failed. Check your settings.')
            : (t('direct_test_failed') || 'Direct connection failed. Check your internet connection.'))
    }

  } catch (error) {
    let errorMessage = t('proxy_test_error') || 'Test failed with an error.'

    // Check for specific error types
    if (error.message.includes('Invalid proxy hostname format') ||
        error.message.includes('Hostname cannot be just a number')) {
      errorMessage = t('proxy_host_invalid') || 'Invalid hostname. Please enter a valid domain name or IP address.'
    } else if (error.message.includes('configuration validation failed')) {
      errorMessage = t('proxy_config_invalid') || 'Invalid proxy configuration. Please check your settings.'
    }

    testResult.value = {
      success: false,
      message: errorMessage
    }
  } finally {
    isTestingProxy.value = false
  }
}
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.advance-tab {
  max-width: 600px;
}

h2 {
  font-size: $font-size-xl;
  font-weight: $font-weight-medium;
  margin-top: 0;
  margin-bottom: $spacing-lg;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  color: var(--color-text);
}

.setting-group {
  margin-bottom: $spacing-lg;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: $spacing-base;
  border-bottom: $border-width $border-style var(--color-border);
  
  &:last-child {
    border-bottom: none;
    margin-bottom: 0;
  }
  
  label {
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    margin-bottom: 0;
    flex-grow: 1;
    min-width: 200px;
  }
}

.excluded-sites-input {
  flex: 1;
  min-width: 100%;
  margin-top: $spacing-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    flex-direction: column;
    align-items: stretch;
    gap: $spacing-sm;
    
    label {
      min-width: auto;
    }
    
    .excluded-sites-input {
      margin-top: 0;
    }
  }
}

.setting-section {
  margin-top: $spacing-xl;
  padding-top: $spacing-xl;
  border-top: 2px solid var(--color-border);

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
    margin-top: 0;
    margin-bottom: $spacing-sm;
    color: var(--color-text);
  }

  .section-description {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    margin-bottom: $spacing-lg;
    line-height: 1.5;
  }
}

.proxy-connection, .proxy-auth {
  display: flex;
  gap: $spacing-base;
  flex-wrap: wrap;

  .proxy-input-group {
    flex: 1;
    min-width: 200px;
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;

    label {
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
      color: var(--color-text);
    }
  }

  .proxy-port {
    max-width: 120px;
  }
}

.proxy-select, .proxy-input {
  min-width: 0;
}

.proxy-test {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
  align-items: flex-start;

  .test-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: $spacing-sm $spacing-base;
    background-color: var(--color-primary);
    color: var(--color-primary-text);
    border: none;
    border-radius: $border-radius-base;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;
    cursor: pointer;
    transition: all 0.2s ease;
    min-width: 160px;

    &:hover:not(:disabled) {
      background-color: var(--color-primary-hover);
      transform: translateY(-1px);
    }

    &:disabled {
      background-color: var(--color-muted);
      color: var(--color-text-muted);
      cursor: not-allowed;
      transform: none;
    }

    &.success {
      background-color: var(--color-success);
      color: white;
    }

    &.error {
      background-color: var(--color-danger);
      color: white;
    }

    .button-content {
      display: flex;
      align-items: center;
      gap: $spacing-xs;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid transparent;
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }

  .test-result {
    padding: $spacing-sm $spacing-base;
    border-radius: $border-radius-base;
    font-size: $font-size-sm;
    font-weight: $font-weight-medium;

    &.success {
      background-color: rgba(34, 197, 94, 0.1);
      color: var(--color-success);
      border: 1px solid rgba(34, 197, 94, 0.3);
    }

    &.error {
      background-color: rgba(239, 68, 68, 0.1);
      color: var(--color-danger);
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
  }
}

.proxy-warning {
  display: flex;
  gap: $spacing-sm;
  padding: $spacing-base;
  background-color: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: $border-radius-base;
  margin-bottom: $spacing-lg;

  .warning-icon {
    font-size: $font-size-lg;
    flex-shrink: 0;
  }

  .warning-content {
    flex: 1;

    strong {
      display: block;
      font-weight: $font-weight-medium;
      color: var(--color-text);
      margin-bottom: $spacing-xs;
    }

    p {
      font-size: $font-size-sm;
      color: var(--color-text-secondary);
      margin: 0;
      line-height: 1.4;
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

// Mobile responsive for proxy settings
@media (max-width: #{$breakpoint-md}) {
  .proxy-connection, .proxy-auth {
    flex-direction: column;
    gap: $spacing-sm;

    .proxy-input-group {
      min-width: auto;
    }

    .proxy-port {
      max-width: none;
    }
  }

  .proxy-test {
    .test-button {
      width: 100%;
      min-width: auto;
    }
  }
}
</style>