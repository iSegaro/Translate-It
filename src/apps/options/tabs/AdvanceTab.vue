<template>
  <section class="options-tab-content advance-tab">
    <div class="settings-container">
      <h2>{{ t('advance_section_title') || 'Advanced Settings' }}</h2>
      
      <div 
        id="TRANSLATION_HISTORY_SECTION"
        class="setting-group vertical"
      >
        <BaseCheckbox
          id="ENABLE_TRANSLATION_HISTORY"
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

      <!-- Proxy Settings Section -->
      <BaseAccordion
        id="PROXY_SECTION"
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
                  id="PROXY_HOST"
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
                  id="PROXY_PORT"
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

      <!-- Debug Mode Section -->
      <BaseAccordion
        id="DEBUG_MODE_SECTION"
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
import { computed, ref, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTabSettings } from '../composables/useTabSettings.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS, LOG_CATEGORIES } from '@/shared/logging/logConstants.js'
import proxyIcon from '@/icons/ui/proxy.png?url'

// Components
import BaseCheckbox from '@/components/base/BaseCheckbox.vue'
import BaseAccordion from '@/components/base/BaseAccordion.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseSelect from '@/components/base/BaseSelect.vue'
import LogLevelItem from '../components/LogLevelItem.vue'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'AdvanceTab')
const settingsStore = useSettingsStore()
const { t } = useUnifiedI18n()
const { handleError } = useErrorHandler()
const { createSetting } = useTabSettings(settingsStore, logger)

// Accordion state
const activeAccordion = ref(null)
const toggleAccordion = (name) => {
  activeAccordion.value = activeAccordion.value === name ? null : name
}

// Global reveal listener for highlighting
onMounted(() => {
  window.addEventListener('options-reveal-accordion', (e) => {
    activeAccordion.value = e.detail;
  });
})

// --- Settings ---

const enableTranslationHistory = createSetting('ENABLE_TRANSLATION_HISTORY', true)

const excludedSites = createSetting('EXCLUDED_SITES', [], {
  transformGet: (v) => Array.isArray(v) ? v.join(', ') : v,
  transformSet: (v) => v.split(',').map(s => s.trim()).filter(Boolean)
})

const debugMode = createSetting('DEBUG_MODE', false, {
  onChanged: (val) => {
    if (val) activeAccordion.value = 'debug'
    else if (activeAccordion.value === 'debug') activeAccordion.value = null
  }
})

const proxyEnabled = createSetting('PROXY_ENABLED', false, {
  onChanged: (val) => { if (val) activeAccordion.value = 'proxy' }
})

const proxyType = createSetting('PROXY_TYPE', 'http')
const proxyHost = createSetting('PROXY_HOST', '')
const proxyPort = createSetting('PROXY_PORT', 8080, {
  transformSet: (v) => parseInt(v) || 8080
})
const proxyUsername = createSetting('PROXY_USERNAME', '')
const proxyPassword = createSetting('PROXY_PASSWORD', '')

// Component Log Levels
const getComponentLogLevel = (name) => settingsStore.settings?.COMPONENT_LOG_LEVELS?.[name] ?? 1
const updateComponentLogLevel = (name, level) => {
  const currentLevels = { ...(settingsStore.settings?.COMPONENT_LOG_LEVELS || {}) }
  currentLevels[name] = Number(level)
  settingsStore.updateSettingLocally('COMPONENT_LOG_LEVELS', currentLevels)
}

// --- Proxy Test Logic ---

const isTestingProxy = ref(false)
const testResult = ref(null)
const proxyTypeOptions = [
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
  { value: 'socks', label: 'SOCKS' }
]

const canTestProxy = computed(() => !proxyEnabled.value || (proxyHost.value && proxyPort.value && proxyType.value))
const testResultClass = computed(() => testResult.value?.success ? 'success' : 'error')
const testButtonText = computed(() => proxyEnabled.value ? t('proxy_test_proxy') : t('proxy_test_direct'))

const testProxyConnection = async () => {
  if (isTestingProxy.value) return
  isTestingProxy.value = true
  testResult.value = null

  try {
    const { proxyManager } = await import('@/shared/proxy/ProxyManager.js')
    proxyManager.setConfig({
      enabled: proxyEnabled.value,
      type: proxyType.value,
      host: proxyHost.value,
      port: proxyPort.value,
      auth: { username: proxyUsername.value, password: proxyPassword.value }
    })

    const success = await proxyManager.testConnection()
    testResult.value = {
      success,
      message: success 
        ? (proxyEnabled.value ? t('proxy_test_success') : t('direct_test_success'))
        : (proxyEnabled.value ? t('proxy_test_failed') : t('direct_test_failed'))
    }
  } catch (error) {
    await handleError(error, { context: 'proxy-connection-test', showToast: false })
    testResult.value = { success: false, message: t('proxy_test_error') || error.message }
  } finally {
    isTestingProxy.value = false
  }
}
</script>
