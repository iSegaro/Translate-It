<template>
  <section class="options-tab-content advance-tab">
    <div class="settings-container">
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

      <div class="setting-group vertical">
        <label class="setting-label">{{ t('excluded_sites_label') || 'Exclude these sites (comma separated)' }}</label>
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
            
            <div class="setting-group horizontal-aligned">
              <label class="setting-label">{{ t('proxy_type_label') || 'Proxy Type' }}</label>
              <div class="input-container">
                <BaseSelect
                  v-model="proxyType"
                  :options="proxyTypeOptions"
                  class="proxy-select"
                />
              </div>
            </div>

            <div class="setting-group horizontal-aligned">
              <label class="setting-label">{{ t('proxy_host_label') || 'Host' }}</label>
              <div class="input-container">
                <BaseInput
                  v-model="proxyHost"
                  placeholder="proxy.example.com"
                  dir="ltr"
                  class="proxy-input"
                />
              </div>
            </div>

            <div class="setting-group horizontal-aligned">
              <label class="setting-label">{{ t('proxy_port_label') || 'Port' }}</label>
              <div class="input-container">
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

            <div class="setting-group horizontal-aligned">
              <label class="setting-label">{{ t('proxy_username_label') || 'Username (Optional)' }}</label>
              <div class="input-container">
                <BaseInput
                  v-model="proxyUsername"
                  placeholder=""
                  dir="ltr"
                  class="proxy-input"
                />
              </div>
            </div>

            <div class="setting-group horizontal-aligned">
              <label class="setting-label">{{ t('proxy_password_label') || 'Password (Optional)' }}</label>
              <div class="input-container">
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
                    <img
                      :src="proxyIcon"
                      class="test-icon-img"
                      width="18"
                      height="18"
                      alt=""
                    >
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
    </div>
  </section>
</template>

<script setup>
import './AdvanceTab.scss'
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
import proxyIcon from '@/icons/ui/proxy.png?url'

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

// --- Advanced settings (Computed with Getter/Setter for Clean Sync) ---

const debugMode = computed({
  get: () => settingsStore.settings?.DEBUG_MODE || false,
  set: (value) => {
    // Debug accordion follows standard open/close behavior
    if (value) {
      activeAccordion.value = 'debug'
    } else if (activeAccordion.value === 'debug') {
      activeAccordion.value = null
    }
    settingsStore.updateSettingLocally('DEBUG_MODE', value)
  }
})

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

// --- Proxy settings (Computed with Getter/Setter) ---

const proxyEnabled = computed({
  get: () => settingsStore.settings?.PROXY_ENABLED || false,
  set: (value) => {
    // Requirement: Only open accordion on enable, do NOT close on disable
    if (value) {
      activeAccordion.value = 'proxy'
    }
    settingsStore.updateSettingLocally('PROXY_ENABLED', value)
  }
})

const proxyType = computed({
  get: () => settingsStore.settings?.PROXY_TYPE || 'http',
  set: (value) => settingsStore.updateSettingLocally('PROXY_TYPE', value)
})

const proxyHost = computed({
  get: () => settingsStore.settings?.PROXY_HOST || '',
  set: (value) => settingsStore.updateSettingLocally('PROXY_HOST', value)
})

const proxyPort = computed({
  get: () => settingsStore.settings?.PROXY_PORT || 8080,
  set: (value) => settingsStore.updateSettingLocally('PROXY_PORT', parseInt(value) || 8080)
})

const proxyUsername = computed({
  get: () => settingsStore.settings?.PROXY_USERNAME || '',
  set: (value) => settingsStore.updateSettingLocally('PROXY_USERNAME', value)
})

const proxyPassword = computed({
  get: () => settingsStore.settings?.PROXY_PASSWORD || '',
  set: (value) => settingsStore.updateSettingLocally('PROXY_PASSWORD', value)
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
  if (!proxyEnabled.value) return true
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

    // If proxy is enabled, update proxy configuration
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
      // Ensure manager knows it's disabled for this test
      proxyManager.setConfig({ enabled: false })
    }

    // Test the connection (it will automatically use direct test if proxy is disabled)
    const success = await proxyManager.testConnection()

    let successMessage = ''
    let failureMessage = ''

    if (proxyEnabled.value) {
      successMessage = t('proxy_test_success') || 'Proxy connection successful!'
      failureMessage = t('proxy_test_failed') || 'Proxy connection failed. Check your settings.'
    } else {
      successMessage = t('direct_test_success') || 'Direct connection successful!'
      failureMessage = t('direct_test_failed') || 'Direct connection failed. Please check your internet.'
    }

    testResult.value = {
      success,
      message: success ? successMessage : failureMessage
    }

    if (success) {
      logger.operation('Connection test completed successfully', {
        mode: proxyEnabled.value ? 'proxy' : 'direct',
        proxyType: proxyEnabled.value ? proxyType.value : 'none'
      })
    } else {
      logger.warn('Connection test failed', {
        mode: proxyEnabled.value ? 'proxy' : 'direct',
        proxyType: proxyEnabled.value ? proxyType.value : 'none'
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
