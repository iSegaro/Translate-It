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
      <h2>{{ t('options_load_error_title') || 'Failed to Load Options' }}</h2>
      <p class="error-message">
        {{ displayErrorMessage }}
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
import './OptionsApp.scss'
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import OptionsLayout from './OptionsLayout.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { loadSettingsModules } from '@/features/settings/utils/settings-modules.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsApp')

// Stores
const settingsStore = useSettingsStore()

// Composables
const { t } = useUnifiedI18n()

// State
const isLoading = ref(true)
const hasError = ref(false)
const errorMessage = ref('')
const errorType = ref(null)

// --- Computed Properties ---

// Reactively update loading text based on current locale
const loadingText = computed(() => t('options_loading') || 'Loading Settings...')

// Reactive error message display with i18n support
const displayErrorMessage = computed(() => {
  if (!errorType.value) return errorMessage.value
  const key = errorType.value.startsWith('ERRORS_') ? errorType.value : `ERRORS_${errorType.value}`
  const translated = t(key)
  return (translated && translated !== key) ? translated : errorMessage.value
})

// RTL detection using unified i18n
const isRTL = computed(() => {
  try {
    return t('IsRTL') === 'true'
  } catch (e) {
    logger.debug('Failed to get RTL setting:', e.message)
    return false
  }
})

// --- Initialization Logic ---

const initialize = async () => {
  logger.debug('🚀 OptionsApp mounting...')
  
  try {
    // Step 1: Load settings store with timeout protection
    logger.debug('⚙️ Loading settings store...')
    await Promise.race([
      settingsStore.loadSettings(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings loading timeout')), 10000)
      )
    ])
    
    // Step 2: Load additional modules (optional)
    logger.debug('📦 Loading additional modules...')
    await loadSettingsModules().catch(err => {
      logger.warn('Failed to load optional settings modules:', err)
    })
    
    logger.debug('✅ OptionsApp initialized successfully')
  } catch (error) {
    logger.error('❌ Failed to initialize options:', error)
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
    errorType.value = matchErrorToType(error)
  } finally {
    isLoading.value = false
  }
}

// Lifecycle
onMounted(initialize)

// Methods
const retryLoading = () => {
  logger.debug('🔄 Retrying options loading...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset store state if possible
  if (settingsStore.$reset) settingsStore.$reset()
  
  // Short delay before retry to ensure clean state
  setTimeout(initialize, 100)
}
</script>
