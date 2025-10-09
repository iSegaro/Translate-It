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
    
    <SidepanelLayout v-else />
    
    <!-- Removed loading component fallback since we now load synchronously -->
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, onUnmounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import SidepanelLayout from './SidepanelLayout.vue'
import browser from 'webextension-polyfill'
import { utilsFactory } from '@/utils/UtilsFactory.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TTSGlobalManager } from '@/features/tts/core/TTSGlobalManager.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelApp');

// Static import is now used for SidepanelLayout

// Language preloading utility
const usePreloadLanguages = async () => {
  const { useLanguages } = await import('@/composables/shared/useLanguages.js')
  const { loadLanguages } = useLanguages()
  // Preload languages in parallel with other initialization tasks
  return loadLanguages()
}


// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()

// Composables  
const { t, changeLanguage } = useUnifiedI18n()

// Error handling
const { handleError } = useErrorHandler()

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('sidepanel-app')

// State
const isLoading = ref(true)
const loadingText = ref('Loading Sidepanel...')
const hasError = ref(false)
const errorMessage = ref('')

// Lazy-loaded theme application
const applyThemeLazy = async (theme) => {
  const { applyTheme } = await utilsFactory.getUIUtils();
  return applyTheme(theme);
};

// Message listener
const handleMessage = (message, _sender, _sendResponse) => {
  // Only handle specific sidepanel messages, let other messages be handled by background
  if (message.action === 'translationResult') {
    translationStore.setTranslation(message.data);
    return false; // Don't keep channel open
  } else if (message.action === 'LANGUAGE_CHANGED') {
    logger.debug('Language changed from options:', message.payload.lang);
    changeLanguage(message.payload.lang);
    return false; // Don't keep channel open
  } else if (message.action === 'THEME_CHANGED') {
    logger.debug('Theme changed from options:', message.payload.theme);
    applyThemeLazy(message.payload.theme).catch(error => logger.error('Failed to apply theme:', error));
    return false; // Don't keep channel open
  }

  // Let other messages (like TRANSLATE) be handled by background service worker
  return false;
};

// System theme change listener for auto mode
const handleSystemThemeChange = (event) => {
  const currentTheme = settingsStore.settings.THEME
  if (currentTheme === 'auto') {
    const systemTheme = event.matches ? 'dark' : 'light'
    logger.debug('System theme changed in auto mode:', systemTheme)
    applyThemeLazy('auto').catch(error => logger.error('Failed to apply auto theme:', error))
  }
};

const initialize = async () => {
  logger.debug('🚀 SidepanelApp mounting...')
  try {
    // Step 1: Set loading text
    logger.debug('📝 Setting loading text...')
    loadingText.value = browser.i18n.getMessage('sidepanel_loading') || 'Loading Sidepanel...'
    logger.debug('✅ Loading text set')

    // Step 2: Load settings store and preload essential data
    logger.debug('⚙️ Loading settings store and preloading data...')
    await Promise.race([
      Promise.all([
        settingsStore.loadSettings(),
        // Preload languages to ensure LanguageSelector has cached values
        usePreloadLanguages()
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Settings loading timeout')), 10000))
    ])
    logger.debug('✅ Settings store loaded and languages preloaded')

    // Step 3: Apply theme
    const settings = settingsStore.settings
    logger.debug('Applying initial theme:', settings.THEME)
    await applyThemeLazy(settings.THEME)

    // Step 4: Add message listener with automatic cleanup
    tracker.addEventListener(browser.runtime.onMessage, 'addListener', handleMessage)

    // Step 5: Add system theme change listener with automatic cleanup
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    tracker.addEventListener(mediaQuery, 'change', handleSystemThemeChange)

    // Step 6: Add visibility change listener for TTS cleanup
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logger.debug('[SidepanelApp] Sidepanel hidden - stopping TTS')

        // Send direct TTS stop message to background to stop any playing TTS
        browser.runtime.sendMessage({
          action: MessageActions.TTS_STOP,
          data: {}
        }).catch(error => {
          logger.debug('[SidepanelApp] Failed to send TTS stop message in visibility change:', error)
        })
      }
    }

    // Add visibility change listener
    tracker.addEventListener(document, 'addEventListener', ['visibilitychange', handleVisibilityChange])

    // Step 7: Also listen for pagehide as additional fallback
    const handlePageHide = (event) => {
      logger.debug('[SidepanelApp] pagehide event fired - stopping TTS', event.persisted)

      // Send direct TTS stop message to background to stop any playing TTS
      browser.runtime.sendMessage({
        action: MessageActions.TTS_STOP,
        data: {}
      }).catch(error => {
        logger.debug('[SidepanelApp] Failed to send TTS stop message in pagehide:', error)
      })
    }

    // Add pagehide listener
    tracker.addEventListener(window, 'addEventListener', ['pagehide', handlePageHide])

    // Step 8: Create lifecycle port connection for background to detect sidepanel closure
    try {
      const lifecyclePort = browser.runtime.connect({ name: 'sidepanel-lifecycle' })
      logger.debug('[SidepanelApp] Sidepanel lifecycle port connected')

      // Port will automatically disconnect when sidepanel closes
      // This triggers background's onDisconnect listener which stops TTS
      lifecyclePort.onDisconnect.addListener(() => {
        logger.debug('[SidepanelApp] Sidepanel lifecycle port disconnected')
      })
    } catch (error) {
      logger.debug('[SidepanelApp] Failed to create lifecycle port:', error)
    }
  } catch (error) {
    await handleError(error, 'SidepanelApp-init')
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
  } finally {
    logger.debug('✨ SidepanelApp initialization complete')
    isLoading.value = false
  }
};

// Lifecycle
onMounted(initialize)

onBeforeUnmount(() => {
  // Stop all TTS instances when sidepanel is closing
  try {
    logger.debug('[SidepanelApp] Stopping TTS instances before sidepanel unmount')

    // Send direct TTS stop message to background to stop any playing TTS
    browser.runtime.sendMessage({
      action: MessageActions.TTS_STOP,
      data: {}
    }).catch(error => {
      logger.debug('[SidepanelApp] Failed to send TTS stop message:', error)
    })

    // Also try to use TTSGlobalManager if available for additional cleanup
    try {
      const ttsManager = TTSGlobalManager()
      if (ttsManager && ttsManager.isInitialized) {
        logger.debug('[SidepanelApp] Additional cleanup via TTSGlobalManager')
        ttsManager.stopAll()
      }
    } catch (managerError) {
      logger.debug('[SidepanelApp] TTSGlobalManager cleanup failed:', managerError)
    }
  } catch (error) {
    logger.error('[SidepanelApp] Failed to stop TTS instances:', error)
  }
})

onUnmounted(() => {
  // Event listeners cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
});

const retryLoading = () => {
  logger.debug('🔄 Retrying sidepanel loading...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset store state
  settingsStore.$reset && settingsStore.$reset()
  
  // Retry mounting logic
  setTimeout(() => { initialize() }, 100)
}
</script>

<style scoped>
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