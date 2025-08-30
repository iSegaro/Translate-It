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
      <h2>{{ t('sidepanel_load_error_title') || 'Failed to Load Sidepanel' }}</h2>
      <p class="error-message">
        {{ errorMessage }}
      </p>
      <button
        class="retry-button"
        @click="retryLoading"
      >
        {{ t('retry_button') || 'Retry' }}
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
import { useTranslationStore } from '@/store/modules/translation'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import SidepanelLayout from './SidepanelLayout.vue'
import browser from 'webextension-polyfill'
import { applyTheme } from '@/utils/ui/theme.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelApp');

// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()

// Composables  
const { t, changeLanguage } = useUnifiedI18n()

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
  } else if (message.action === 'LANGUAGE_CHANGED') {
    logger.debug('Language changed from options:', message.payload.lang);
    changeLanguage(message.payload.lang);
  } else if (message.action === 'THEME_CHANGED') {
    logger.debug('Theme changed from options:', message.payload.theme);
    applyTheme(message.payload.theme).catch(error => logger.error('Failed to apply theme:', error));
  }
};

// System theme change listener for auto mode
const handleSystemThemeChange = (event) => {
  const currentTheme = settingsStore.settings.THEME
  if (currentTheme === 'auto') {
    const systemTheme = event.matches ? 'dark' : 'light'
    logger.debug('System theme changed in auto mode:', systemTheme)
    applyTheme('auto').catch(error => logger.error('Failed to apply auto theme:', error))
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

    // Step 3: Apply theme
    const settings = settingsStore.settings
    logger.debug('Applying initial theme:', settings.THEME)
    await applyTheme(settings.THEME)

    // Step 4: Add message listener
    browser.runtime.onMessage.addListener(handleMessage)
    
    // Step 5: Add system theme change listener for auto mode
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', handleSystemThemeChange)
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
  
  // Remove system theme listener
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.removeEventListener('change', handleSystemThemeChange);
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