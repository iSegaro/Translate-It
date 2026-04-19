<template>
  <section class="options-tab-content">
    <h2>{{ t('advance_section_title') || 'Advanced Settings' }}</h2>
    
    <div class="setting-group vertical">
      <BaseCheckbox
        v-model="enableTranslationHistory"
        :label="t('enable_translation_history_label') || 'Enable Translation History'"
      />
      <p class="setting-description">
        {{ t('enable_translation_history_description') || 'Save translations in history.' }}
      </p>
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

    <!-- Proxy Settings Section (Accordion Style) -->
    <div class="setting-group proxy-setting accordion-item">
      <div class="accordion-header-wrapper">
        <div class="checkbox-area">
          <BaseCheckbox
            v-model="proxyEnabled"
            class="proxy-main-checkbox"
          />
          <span 
            class="accordion-title-text"
            :class="{ disabled: !proxyEnabled, active: activeAccordion === 'proxy' }"
            @click="proxyEnabled ? toggleAccordion('proxy') : (proxyEnabled = true)"
          >
            {{ t('proxy_section_title') || 'Proxy Settings' }}
          </span>
        </div>
        
        <div 
          v-if="proxyEnabled"
          class="accordion-trigger-area"
          :class="{ active: activeAccordion === 'proxy' }"
          @click="toggleAccordion('proxy')"
        >
          <div 
            class="accordion-icon-wrapper"
            :class="{ active: activeAccordion === 'proxy' }"
          >
            <span class="accordion-icon">+</span>
          </div>
        </div>
      </div>

      <div
        class="accordion-content"
        :class="{ open: activeAccordion === 'proxy' && proxyEnabled }"
      >
        <div class="accordion-inner">
          <p class="setting-description mb-md">
            {{ t('proxy_section_description') || 'Configure proxy settings for providers with geographical restrictions (e.g., Gemini from Iran)' }}
          </p>
          
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
        </div>
      </div>
    </div>

    <!-- Debug Mode Section (Accordion Style) -->
    <div class="setting-group debug-setting accordion-item">
      <div class="accordion-header-wrapper">
        <div class="checkbox-area">
          <BaseCheckbox
            v-model="debugMode"
            class="debug-main-checkbox"
          />
          <span 
            class="accordion-title-text"
            :class="{ disabled: !debugMode, active: activeAccordion === 'debug' }"
            @click="debugMode ? toggleAccordion('debug') : (debugMode = true)"
          >
            {{ t('advance_debug_mode_label') || 'Debug Mode' }}
          </span>
        </div>
        
        <div 
          v-if="debugMode"
          class="accordion-trigger-area"
          :class="{ active: activeAccordion === 'debug' }"
          @click="toggleAccordion('debug')"
        >
          <div 
            class="accordion-icon-wrapper"
            :class="{ active: activeAccordion === 'debug' }"
          >
            <span class="accordion-icon">+</span>
          </div>
        </div>
      </div>

      <div
        class="accordion-content"
        :class="{ open: activeAccordion === 'debug' && debugMode }"
      >
        <div class="accordion-inner">
          <p class="setting-description mb-md">
            {{ t('debug_section_description') || 'Enable detailed logging for specific components. Overrides global log level.' }}
          </p>
          
          <div class="debug-grid">
            <LogLevelItem
              v-for="(name, key) in LOG_COMPONENTS"
              :key="key"
              :component-name="name"
              :model-value="getComponentLogLevel(name)"
              @update:model-value="updateComponentLogLevel(name, $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import LogLevelItem from '../components/LogLevelItem.vue'

import { useI18n } from 'vue-i18n'

const settingsStore = useSettingsStore()
const { handleError } = useErrorHandler()
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AdvanceTab')

const { t } = useI18n()

// Accordion state management
const activeAccordion = ref(null)

const toggleAccordion = (name) => {
  if (activeAccordion.value === name) {
    activeAccordion.value = null
  } else {
    activeAccordion.value = name
  }
}

// Advanced settings
const debugMode = ref(settingsStore.settings?.DEBUG_MODE || false)

const enableTranslationHistory = computed({
  get: () => settingsStore.settings?.ENABLE_TRANSLATION_HISTORY ?? true,
  set: (value) => settingsStore.updateSettingLocally('ENABLE_TRANSLATION_HISTORY', value)
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

// Proxy settings refs synchronized with store (like other tabs)
const proxyEnabled = ref(settingsStore.settings?.PROXY_ENABLED || false)
const proxyType = ref(settingsStore.settings?.PROXY_TYPE || 'http')
const proxyHost = ref(settingsStore.settings?.PROXY_HOST || '')
const proxyPort = ref(settingsStore.settings?.PROXY_PORT || 8080)
const proxyUsername = ref(settingsStore.settings?.PROXY_USERNAME || '')
const proxyPassword = ref(settingsStore.settings?.PROXY_PASSWORD || '')

// Sync with settings on mount
onMounted(() => {
  debugMode.value = settingsStore.settings?.DEBUG_MODE || false
  proxyEnabled.value = settingsStore.settings?.PROXY_ENABLED || false
  proxyType.value = settingsStore.settings?.PROXY_TYPE || 'http'
  proxyHost.value = settingsStore.settings?.PROXY_HOST || ''
  proxyPort.value = settingsStore.settings?.PROXY_PORT || 8080
  proxyUsername.value = settingsStore.settings?.PROXY_USERNAME || ''
  proxyPassword.value = settingsStore.settings?.PROXY_PASSWORD || ''
})

// Update settings locally when changed (like other tabs)
watch(debugMode, (value) => {
  if (value) {
    // Auto-open this accordion when enabled
    activeAccordion.value = 'debug'
  } else if (activeAccordion.value === 'debug') {
    // Close if it was open
    activeAccordion.value = null
  }
  settingsStore.updateSettingLocally('DEBUG_MODE', value)
})

watch(proxyEnabled, (value) => {
  if (value) {
    // Auto-open this accordion when enabled
    activeAccordion.value = 'proxy'
  } else if (activeAccordion.value === 'proxy') {
    // Close if it was open
    activeAccordion.value = null
  }
  settingsStore.updateSettingLocally('PROXY_ENABLED', value)
})

watch(proxyType, (value) => {
  settingsStore.updateSettingLocally('PROXY_TYPE', value)
})

watch(proxyHost, (value) => {
  settingsStore.updateSettingLocally('PROXY_HOST', value)
})

watch(proxyPort, (value) => {
  settingsStore.updateSettingLocally('PROXY_PORT', parseInt(value) || 8080)
})

watch(proxyUsername, (value) => {
  settingsStore.updateSettingLocally('PROXY_USERNAME', value)
})

watch(proxyPassword, (value) => {
  settingsStore.updateSettingLocally('PROXY_PASSWORD', value)
})

// Component log levels
const getComponentLogLevel = (name) => {
  return settingsStore.settings?.COMPONENT_LOG_LEVELS?.[name] ?? 1 // Default to WARN
}

const updateComponentLogLevel = (name, level) => {
  const currentLevels = { ...(settingsStore.settings?.COMPONENT_LOG_LEVELS || {}) }
  currentLevels[name] = Number(level)
  settingsStore.updateSettingLocally('COMPONENT_LOG_LEVELS', currentLevels)
}

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

    // If proxy is not enabled, show appropriate message
    if (!proxyEnabled.value) {
      testResult.value = {
        success: false,
        message: t('proxy_not_enabled') || 'Please enable proxy first to test connection.'
      }
      return
    }

    // Update proxy configuration
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

    // Test the connection
    const success = await proxyManager.testConnection()

    const successMessage = success
      ? (t('proxy_test_success') || 'Proxy connection successful!')
      : (t('proxy_test_failed') || 'Proxy connection failed. Check your settings.')

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
    } else if (error.message.includes('SOCKS proxy is not supported')) {
      errorMessage = t('proxy_socks_unsupported') || 'SOCKS proxy is not supported in browser extensions. Please use HTTP or HTTPS proxy instead.'
    } else if (error.message.includes('HTTPS through HTTP proxy is not supported')) {
      errorMessage = t('proxy_https_via_http_unsupported') || 'HTTPS through HTTP proxy is not supported. Please use HTTPS proxy for HTTPS URLs.'
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

.setting-group {
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;

  label {
    margin-bottom: 0;
    flex-grow: 1;
    min-width: 200px;
  }

  &.vertical {
    flex-direction: column;
    align-items: flex-start;
    gap: $spacing-xs;
    margin-bottom: $spacing-lg;

    &:last-child {
      margin-bottom: 0;
    }
  }
}

.setting-description {
  font-size: $font-size-sm;
  color: var(--color-text-secondary);
  margin: 0 0 0 $spacing-xl; // Align with checkbox label
  line-height: 1.4;
  max-width: 800px;
}

// Adjust description margin for RTL
[dir="rtl"] .setting-description {
  margin: 0 $spacing-xl 0 0;
}

.excluded-sites-input {
  flex: 1;
  min-width: 100%;
  margin-top: $spacing-sm;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .setting-group {
    label {
      min-width: auto;
    }
    
    .excluded-sites-input {
      margin-top: 0;
    }
  }
}

// Accordion styles for proxy setting
.accordion-item {
  margin-top: $spacing-lg;
  border-top: 1px solid var(--color-border);
  padding: 0;
  display: flex;
  flex-direction: column !important;
  align-items: stretch !important;

  .accordion-header-wrapper {
    width: 100%;
    padding: $spacing-sm 0;
    background: transparent;
    border: none;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    cursor: pointer;
    font-size: $font-size-base;
    font-weight: $font-weight-medium;
    color: var(--color-text);
    transition: color $transition-base;

    .checkbox-area {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 0 0 auto;
      
      :deep(.proxy-main-checkbox), :deep(.debug-main-checkbox) {
        gap: 0 !important;
        width: auto !important;
        flex: none !important;
        flex-grow: 0 !important;
        min-width: auto !important;
        margin: 0 !important;

        .ti-checkbox__label {
          display: none !important;
        }
      }

      .accordion-title-text {
        cursor: pointer;
        user-select: none;
        padding: 4px 0;
        transition: color $transition-base;

        &:hover {
          color: var(--color-primary);
        }

        &.active {
          color: var(--color-primary);
          font-weight: $font-weight-medium;
        }

        &.disabled {
          opacity: 0.9;
        }
      }
    }

    .accordion-trigger-area {
      padding: $spacing-sm $spacing-md;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-inline-end: -$spacing-md;
      margin-inline-start: auto;

      &:hover {
        .accordion-icon-wrapper {
          color: var(--color-primary);
        }
      }
    }
  }

  .accordion-content {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
    opacity: 0;
    overflow: hidden;
    width: 100%;

    &.open {
      grid-template-rows: 1fr;
      opacity: 1;
    }

    .accordion-inner {
      min-height: 0;
      padding: 0 0 $spacing-md 0;

      .debug-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: $spacing-sm;
        margin-top: $spacing-md;
        margin-inline-start: 28px;
      }
    }
  }

  .accordion-icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    color: var(--color-text-secondary);

    &.active {
      transform: rotate(45deg);
      color: var(--color-primary);
    }

    .accordion-icon {
      font-size: 18px;
      font-weight: 300;
      line-height: 1;
      pointer-events: none;
      user-select: none;
    }
  }

  .setting-description {
    font-size: $font-size-sm;
    color: var(--color-text-secondary);
    line-height: 1.4;
    margin-bottom: $spacing-sm;

    &.mb-md {
      margin-inline-start: 28px;
    }
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
  .debug-grid {
    grid-template-columns: 1fr !important;
    margin-inline-start: 0 !important;
  }

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