<template>
  <div class="extension-sidepanel">
    <div
      v-if="isLoading"
      class="loading-container"
    >
      <LoadingSpinner size="lg" />
      <span class="loading-text">{{ loadingText }}</span>
    </div>
    
    <div
      v-else-if="hasError"
      class="error-container"
    >
      <div class="error-icon">
        ⚠️
      </div>
      <h2>{{ $i18n('sidepanel_load_error_title') || 'Failed to Load Sidepanel' }}</h2>
      <p class="error-message">
        {{ errorMessage }}
      </p>
      <button
        class="retry-button"
        @click="retryLoading"
      >
        {{ $i18n('retry_button') || 'Retry' }}
      </button>
    </div>
    
    <template v-else>
      <SidepanelLayout />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useTranslationStore } from '@/store/core/translation'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import SidepanelLayout from './SidepanelLayout.vue'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelApp');


// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()

// Error handling
const { handleError } = useErrorHandler()

// State
const isLoading = ref(true)
const loadingText = ref('Loading Sidepanel...')
const hasError = ref(false)
const errorMessage = ref('')

// Message listener
const handleMessage = (message) => {
  if (message.action === 'translationResult') {
    translationStore.setTranslation(message.data);
  }
};

// Lifecycle
onMounted(async () => {
  logger.debug('🚀 SidepanelApp mounting...')
  try {
    // Step 1: Set loading text
    logger.debug('📝 Setting loading text...')
    loadingText.value = browser.i18n.getMessage('sidepanel_loading') || 'Loading Sidepanel...'
    logger.debug('✅ Loading text set')

    // Step 2: Load settings store
    logger.debug('⚙️ Loading settings store...')
    await Promise.race([
      settingsStore.loadSettings(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Settings loading timeout')), 10000))
    ])
    logger.debug('✅ Settings store loaded')

    // Step 3: Add message listener
    browser.runtime.onMessage.addListener(handleMessage)
  } catch (error) {
    await handleError(error, 'SidepanelApp-init')
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
  } finally {
    logger.debug('✨ SidepanelApp initialization complete')
    isLoading.value = false
  }
})

onUnmounted(() => {
  browser.runtime.onMessage.removeListener(handleMessage);
});

const retryLoading = () => {
  logger.debug('🔄 Retrying sidepanel loading...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset store state
  settingsStore.$reset && settingsStore.$reset()
  
  // Retry mounting logic
  setTimeout(() => { onMounted() }, 100)
}
</script>

<style scoped>
.extension-sidepanel {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 1rem;
  padding: 2rem;
}

.loading-text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
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