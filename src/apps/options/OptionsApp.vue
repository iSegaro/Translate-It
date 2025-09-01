<template>
  <div 
    class="extension-options"
    :class="{ 'rtl': isRTL }"
    :dir="isRTL ? 'rtl' : 'ltr'"
  >
    <div
      v-if="isLoading"
      class="loading-container"
    >
      <LoadingSpinner size="xl" />
      <span class="loading-text">{{ loadingText }}</span>
    </div>
    
    <div
      v-else-if="hasError"
      class="error-container"
    >
      <div class="error-icon">
        ⚠️
      </div>
      <h2>Failed to Load Options</h2>
      <p class="error-message">
        {{ errorMessage }}
      </p>
      <button
        class="retry-button"
        @click="retryLoading"
      >
        Retry
      </button>
    </div>
    
    <template v-else>
      <OptionsLayout />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import OptionsLayout from './OptionsLayout.vue'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import { loadSettingsModules } from '@/utils/settings-modules.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import browser from 'webextension-polyfill'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsApp');



// Stores
const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)
const { t, locale } = useUnifiedI18n()
const loadingText = ref(t('options_loading') || 'Loading Settings...')

import { watch } from 'vue'
// Reactively update loadingText when locale changes
watch(() => locale.value, () => {
  loadingText.value = t('options_loading') || 'Loading Settings...'
})
const hasError = ref(false)
const errorMessage = ref('')

// RTL detection using unified i18n (reactive to language changes)
const isRTL = computed(() => {
  try {
    const rtlValue = t('IsRTL') || 'false'
    return rtlValue === 'true'
  } catch (e) {
    logger.debug('Failed to get RTL setting:', e.message)
    return false
  }
})

const initialize = async () => {
  logger.debug('🚀 OptionsApp mounting...')
  
  try {
  // Step 1: Set loading text
  logger.debug('📝 Setting loading text...')
  loadingText.value = t('options_loading') || 'Loading Settings...'
  logger.debug('✅ Loading text set')
    
    // Step 2: Load settings store
  logger.debug('⚙️ Loading settings store...')
    await Promise.race([
      settingsStore.loadSettings(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings loading timeout')), 10000)
      )
    ])
  logger.debug('✅ Settings store loaded')
    
    // Step 3: Load additional modules
  logger.debug('🔧 Loading additional modules...')
    await initializeOptions()
  logger.debug('✅ Additional modules loaded')
    
  } catch (error) {
  logger.error('❌ Failed to initialize options:', error)
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
  } finally {
  logger.debug('✨ OptionsApp initialization complete')
    isLoading.value = false
  }
};

// Lifecycle
onMounted(initialize)

const initializeOptions = async () => {
  try {
    await loadSettingsModules()
  } catch (error) {
  logger.warn('⚠️ Failed to load settings modules:', error)
    // Don't throw - this is optional
  }
}

const retryLoading = () => {
  logger.debug('🔄 Retrying options loading...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset store state
  settingsStore.$reset && settingsStore.$reset()
  
  // Retry mounting logic
  setTimeout(() => {
    initialize()
  }, 100)
};
</script>

<style scoped>
.extension-options {
  /* انتقال استایل‌های عمومی به اینجا */
  width: 100vw;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-background) !important;
  box-sizing: border-box;
  padding: 20px;
}

.extension-options.rtl {
  direction: rtl;
  margin-top: 10px;
  margin-bottom: 10px !important;
  
  .loading-container {
    text-align: right;
  }
}
</style>