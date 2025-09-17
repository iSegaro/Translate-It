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
          <div class="test-container">
            <button
              :disabled="isTestingProxy || !canTestProxy"
              :class="['test-button', testResultClass]"
              @click="testProxyConnection"
            >
              <span
                v-if="isTestingProxy"
                class="button-content"
              >
                <div class="spinner" />
                {{ t('proxy_testing') || 'Testing...' }}
              </span>
              <span
                v-else
                class="button-content"
              >
                <svg
                  class="test-icon"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M8 21h3M21 16v3a2 2 0 0 1-2 2h-3M12 12l-3-3 3-3M16 8l3 3-3 3" />
                </svg>
                {{ testButtonText }}
              </span>
            </button>

            <div
              v-if="testResult"
              :class="['test-result', testResult.success ? 'success' : 'error']"
            >
              {{ testResult.message }}
            </div>
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
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AdvanceTab')

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

  logger.debug('Starting proxy connection test', {
    proxyEnabled: proxyEnabled.value,
    proxyType: proxyType.value,
    proxyHost: proxyHost.value,
    proxyPort: proxyPort.value
  })

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

    const successMessage = success
      ? (proxyEnabled.value
          ? (t('proxy_test_success') || 'Proxy connection successful!')
          : (t('direct_test_success') || 'Direct connection successful!'))
      : (proxyEnabled.value
          ? (t('proxy_test_failed') || 'Proxy connection failed. Check your settings.')
          : (t('direct_test_failed') || 'Direct connection failed. Check your internet connection.'))

    testResult.value = {
      success,
      message: successMessage
    }

    if (success) {
      logger.operation('Proxy test completed successfully', {
        proxyEnabled: proxyEnabled.value,
        proxyType: proxyType.value
      })
    } else {
      logger.warn('Proxy test failed', {
        proxyEnabled: proxyEnabled.value,
        proxyType: proxyType.value
      })
    }

  } catch (error) {
    logger.error('Proxy test error', {
      error: error.message,
      proxyEnabled: proxyEnabled.value,
      proxyType: proxyType.value
    })

    // Use error handler for consistent error processing
    await handleError(error, {
      context: 'proxy-connection-test',
      showToast: false,  // We handle UI feedback ourselves
      metadata: {
        proxyType: proxyType.value,
        proxyHost: proxyHost.value,
        proxyPort: proxyPort.value
      }
    })

    let errorMessage = t('proxy_test_error') || 'Test failed with an error.'

    // Check for specific error types
    if (error.message.includes('Invalid proxy hostname format') ||
        error.message.includes('Hostname cannot be just a number')) {
      errorMessage = t('proxy_host_invalid') || 'Invalid hostname. Please enter a valid domain name or IP address.'
    } else if (error.message.includes('configuration validation failed')) {
      errorMessage = t('proxy_config_invalid') || 'Invalid proxy configuration. Please check your settings.'
    } else if (error.message.includes('Unsupported proxy type')) {
      errorMessage = t('proxy_type_unsupported') || 'Unsupported proxy type. Please select HTTP, HTTPS, or SOCKS.'
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

  // Remove border-bottom when followed by a setting-section
  & + .setting-section {
    border-top: none;
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

  // Reduce top spacing and border when following setting-group
  &.proxy-section {
    margin-top: $spacing-lg;
    padding-top: $spacing-lg;
  }

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

  .test-container {
    display: flex;
    align-items: flex-start;
    gap: $spacing-base;
    flex-wrap: wrap;
  }

  .test-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 12px 20px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    border: 1px solid #2563eb;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    min-width: 180px;
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
      transition: left 0.5s;
    }

    &:hover:not(:disabled) {
      background: linear-gradient(135deg, #2563eb, #1e40af);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);

      &::before {
        left: 100%;
      }
    }

    &:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.2);
    }

    &:disabled {
      background: linear-gradient(135deg, #9ca3af, #6b7280);
      border-color: #9ca3af;
      color: #f3f4f6;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    &.success {
      background: linear-gradient(135deg, #10b981, #059669);
      border-color: #059669;
      box-shadow: 0 2px 4px rgba(16, 185, 129, 0.2);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #059669, #047857);
        box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
      }
    }

    &.error {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      border-color: #dc2626;
      box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);

      &:hover:not(:disabled) {
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);
      }
    }

    .button-content {
      display: flex;
      align-items: center;
      gap: 8px;

      .test-icon {
        flex-shrink: 0;
        transition: transform 0.3s ease;
      }
    }

    &:hover:not(:disabled) .button-content .test-icon {
      transform: scale(1.1);
    }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-top: 2px solid currentColor;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  }

  .test-result {
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    border: 1px solid;
    animation: slideIn 0.3s ease-out;
    flex: 1;
    min-width: 250px;
    align-self: center;

    &.success {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05));
      color: #059669;
      border-color: rgba(16, 185, 129, 0.3);
      box-shadow: 0 2px 4px rgba(16, 185, 129, 0.1);

      &::before {
        content: '✓';
        margin-right: 8px;
        font-weight: bold;
        color: #10b981;
      }
    }

    &.error {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.1), rgba(220, 38, 38, 0.05));
      color: #dc2626;
      border-color: rgba(239, 68, 68, 0.3);
      box-shadow: 0 2px 4px rgba(239, 68, 68, 0.1);

      &::before {
        content: '✗';
        margin-right: 8px;
        font-weight: bold;
        color: #ef4444;
      }
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

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
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
    .test-container {
      flex-direction: column;
      align-items: stretch;
      gap: $spacing-sm;
    }

    .test-button {
      width: 100%;
      min-width: auto;
    }

    .test-result {
      min-width: auto;
      align-self: stretch;
    }
  }
}
</style>