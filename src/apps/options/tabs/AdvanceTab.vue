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
    <BaseAccordion
      :is-open="activeAccordion === 'proxy'"
      item-class="proxy-setting"
      @toggle="toggleAccordion('proxy')"
    >
      <template #header>
        <div class="checkbox-area">
          <BaseCheckbox
            v-model="proxyEnabled"
            class="proxy-main-checkbox"
            @click.stop
          />
          <span 
            class="accordion-title-text"
            :class="{ active: activeAccordion === 'proxy' }"
          >
            {{ t('proxy_section_title') || 'Proxy Settings' }}
          </span>
        </div>
      </template>

      <template #content>
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
      </template>
    </BaseAccordion>

    <!-- Debug Mode Section (Accordion Style) -->
    <BaseAccordion
      :is-open="activeAccordion === 'debug'"
      item-class="debug-setting"
      @toggle="toggleAccordion('debug')"
    >
      <template #header>
        <div class="checkbox-area">
          <BaseCheckbox
            v-model="debugMode"
            class="debug-main-checkbox"
            @click.stop
          />
          <span 
            class="accordion-title-text"
            :class="{ active: activeAccordion === 'debug' }"
          >
            {{ t('advance_debug_mode_label') || 'Debug Mode' }}
          </span>
        </div>
      </template>

      <template #content>
        <div class="accordion-inner">
          <p class="setting-description mb-md">
            {{ t('debug_section_description') || 'Enable detailed logging for specific components. Overrides global log level.' }}
          </p>
          
          <div class="debug-categories">
            <div 
              v-for="(category, catId) in LOG_CATEGORIES" 
              :key="catId"
              class="debug-category-group"
            >
              <h4 class="category-title">
                {{ category.label }}
              </h4>
              <div class="debug-grid">
                <LogLevelItem
                  v-for="name in category.components"
                  :key="name"
                  :component-name="name"
                  :model-value="getComponentLogLevel(name)"
                  @update:model-value="updateComponentLogLevel(name, $event)"
                />
              </div>
            </div>
          </div>
        </div>
      </template>
    </BaseAccordion>
  </section>
</template>

<script setup>
import { computed, ref, watch, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseAccordion from '@/components/base/BaseAccordion.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS, LOG_CATEGORIES } from '@/shared/logging/logConstants.js'
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
    activeAccordion.value = 'debug'
  } else if (activeAccordion.value === 'debug') {
    activeAccordion.value = null
  }
  settingsStore.updateSettingLocally('DEBUG_MODE', value)
})

watch(proxyEnabled, (value) => {
  if (value) {
    activeAccordion.value = 'proxy'
  } else if (activeAccordion.value === 'proxy') {
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
