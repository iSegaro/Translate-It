<template>
  <div class="extension-options">
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
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import OptionsLayout from './OptionsLayout.vue'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import { loadSettingsModules } from '@/utils/settings-modules.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
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

// Lifecycle
onMounted(async () => {
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
})

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
    onMounted()
  }, 100)
};
</script>

<style scoped>
.extension-options {
  /* The body now handles centering. This container just needs to hold the layout. */
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-background) !important;
}

/* CSS context separation completed */

.loading-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1.5rem;
  padding: 3rem;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem;
  max-width: 500px;
  text-align: center;
}

.error-icon {
  font-size: 3rem;
}

.error-container h2 {
  color: var(--color-error, #ef4444);
  margin: 0;
}

.error-message {
  color: var(--color-text-secondary, #666);
  margin: 0;
}

.retry-button {
  padding: 0.75rem 1.5rem;
  background-color: var(--color-primary, #3b82f6);
  color: var(--color-background, white);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: var(--color-primary-dark, #2563eb);
}
</style>