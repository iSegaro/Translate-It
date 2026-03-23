<template>
  <div class="popup-wrapper">
    <!-- Initial Loading State -->
    <template v-if="isLoading">
      <div class="popup-container">
        <div class="loading-container">
          <LoadingSpinner size="sm" />
          <span class="loading-text">{{ loadingText }}</span>
        </div>
      </div>
    </template>
    
    <!-- Error State Display -->
    <template v-else-if="hasError">
      <div class="popup-container">
        <div class="error-container">
          <div class="error-icon">
            ⚠️
          </div>
          <h2>{{ t('popup_load_error_title') || 'Failed to Load Popup' }}</h2>
          <p class="error-message">
            {{ displayErrorMessage }}
          </p>
          <button
            class="retry-button"
            @click="retryLoading"
          >
            {{ t('retry_button') || 'Retry' }}
          </button>
        </div>
      </div>
    </template>
    
    <!-- Main Popup Content -->
    <template v-else>
      <div class="popup-content-container">
        <!-- Sticky Header: Contains Toolbar and Language/Provider Selectors -->
        <div class="sticky-header">
          <PopupHeader 
            :target-language="targetLanguage" 
            :provider="currentProvider"
          />
          <div class="language-controls">
            <!-- Provider Selector: Manages temporary session-based provider overrides -->
            <ProviderSelector
              v-model="currentProvider"
              mode="split"
              :is-global="false"
              :show-sync="true"
              :disabled="!canTranslateFromForm"
              @translate="handleTranslate"
            />

            <!-- Language Selector: Handles source and target language selection -->
            <LanguageSelector
              v-model:source-language="sourceLanguage"
              v-model:target-language="targetLanguage"
              :source-title="t('popup_source_language_title') || 'زبان مبدا'"
              :target-title="t('popup_target_language_title') || 'زبان مقصد'"
              :swap-title="t('popup_swap_languages_title') || 'جابجایی زبان‌ها'"
              :swap-alt="t('popup_swap_languages_alt_icon') || 'Swap'"
              :auto-detect-label="'Auto-Detect'"
            />
          </div>
        </div>
        
        <!-- Scrollable Translation Area: Contains the main translation form -->
        <div class="translation-container">
          <TranslationForm
            ref="translationFormRef"
            :source-language="sourceLanguage"
            :target-language="targetLanguage"
            :provider="currentProvider"
            @can-translate-change="canTranslateFromForm = $event" 
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import PopupHeader from '@/components/popup/PopupHeader.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import TranslationForm from '@/components/popup/TranslationForm.vue'
import browser from 'webextension-polyfill'
import { utilsFactory } from '@/utils/UtilsFactory.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useTTSGlobal } from '@/features/tts/core/TTSGlobalManager.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { useUnifiedTranslation } from '@/features/translation/composables/useUnifiedTranslation.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageContexts } from '@/shared/messaging/core/MessagingConstants.js';

// --- Initialization & Setup ---
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupApp')

// Resource tracker for automatic cleanup of timeouts and listeners
const tracker = useResourceTracker('popup-app')

/**
 * Preload languages in parallel with other initialization tasks
 * to ensure LanguageSelector has cached values immediately
 */
const usePreloadLanguages = async () => {
  const { useLanguages } = await import('@/composables/shared/useLanguages.js')
  const { loadLanguages } = useLanguages()
  return loadLanguages()
}

// Stores & Composables
const settingsStore = useSettingsStore()
const { sendMessage } = useMessaging(MessageContexts.POPUP)
const { handleError } = useErrorHandler()
const { t } = useUnifiedI18n()
const { 
  sourceLanguage,
  targetLanguage,
  clearTranslation
} = useUnifiedTranslation('popup');

// TTS Global Manager for cross-context lifecycle management
const ttsGlobal = useTTSGlobal({ 
  type: 'popup', 
  name: 'PopupApp'
})

// --- Reactive State ---
const isLoading = ref(true)
const loadingText = ref('Initializing...')
const hasError = ref(false)
const errorMessage = ref('')
const errorType = ref(null)
const canTranslateFromForm = ref(false)
const currentProvider = ref('')

// Reactive error message display with i18n support
const displayErrorMessage = computed(() => {
  if (!errorType.value) return errorMessage.value;
  const key = errorType.value.startsWith('ERRORS_') ? errorType.value : `ERRORS_${errorType.value}`;
  const translated = t(key);
  return (translated && translated !== key) ? translated : errorMessage.value;
});

// Refs for child component communication
const translationFormRef = ref(null)

// --- Event Handlers ---

/**
 * Handle translation requests emitted from ProviderSelector
 */
const handleTranslate = () => {
  const activeForm = translationFormRef.value;
  if (activeForm && typeof activeForm.triggerTranslation === 'function') {
    activeForm.triggerTranslation();
  }
}

/**
 * Lazy-loaded theme application to reduce initial bundle size
 */
const applyThemeLazy = async (theme) => {
  const { applyTheme } = await utilsFactory.getUIUtils();
  return applyTheme(theme);
};

/**
 * Main initialization sequence for the popup
 */
const initialize = async () => {
  try {
    // Step 1: Set localized loading text
    loadingText.value = t('popup_loading') || 'Loading Popup...'

    // Step 2: Load settings and preload languages in parallel with timeout safety
    await Promise.race([
      Promise.all([
        settingsStore.loadSettings(),
        usePreloadLanguages()
      ]),
      new Promise((_, reject) =>
        tracker.trackTimeout(() => reject(new Error('Settings loading timeout')), 10000)
      )
    ])

    // Step 3: Apply user's theme preference
    const settings = settingsStore.settings
    await applyThemeLazy(settings.THEME)
    
    // Step 4: Initialize session provider from global settings
    if (!currentProvider.value) {
      currentProvider.value = settings.TRANSLATION_API
    }

    // Step 5: Global Event Listeners (e.g., clearing fields from other components)
    tracker.addEventListener(document, 'clear-storage', async () => {
      await clearTranslation();
    })

    logger.debug('[PopupApp] Popup initialized successfully')

  } catch (error) {
    const isSilent = await handleError(error, 'popup-initialization')
    if (!isSilent) {
      hasError.value = true
      errorMessage.value = error.message || 'Unknown error occurred'
      
      // Attempt to identify error type for better UI feedback
      try {
        const { matchErrorToType } = await import('@/shared/error-management/ErrorMatcher.js')
        errorType.value = matchErrorToType(error)
      } catch {
        logger.warn('Failed to load ErrorMatcher during initialization failure');
      }
    }
  } finally {
    isLoading.value = false
  }
}

// --- Lifecycle Hooks ---

onMounted(() => {
  /**
   * Register with TTS Global Manager. 
   * This ensures that if the popup closes, any ongoing TTS is stopped.
   */
  ttsGlobal.register(async () => {
    try {
      await sendMessage({ action: MessageActions.TTS_STOP, data: { source: 'popup-cleanup' } })
    } catch (error) {
      logger.error('[PopupApp] Failed to stop TTS during cleanup:', error)
    }
  })

  /**
   * Establish a port connection to the background script.
   * Disconnection of this port is the most reliable way to detect popup closure.
   */
  const port = browser.runtime.connect({ name: 'popup-lifecycle' })
  port.postMessage({ action: 'POPUP_OPENED', data: { timestamp: Date.now() } })
  
  window.__popupPort = port
  
  // Start the initialization sequence
  initialize()
})

onUnmounted(() => {
  logger.debug('[PopupApp] Popup unmounting - cleaning up resources')
  
  // Explicitly disconnect lifecycle port
  if (window.__popupPort) {
    try { window.__popupPort.disconnect() } catch {
      // Ignore disconnect errors as the port might already be closed
    }
    delete window.__popupPort
  }
  
  // Unregister from TTS manager
  ttsGlobal.unregister()
})

/**
 * Handle manual retry attempt on failure
 */
const retryLoading = () => {
  logger.debug('🔄 Retry button clicked! Retrying popup initialization...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset settings store state before retrying
  if (settingsStore.$reset) {
    settingsStore.$reset()
  }
  
  tracker.trackTimeout(() => { initialize() }, 100)
}
</script>

<style scoped lang="scss">
@use "@/assets/styles/base/variables" as *;

/* Main popup wrapper: Handles centering on large screens */
.popup-wrapper {
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  font-family: "Vazirmatn", "Segoe UI", sans-serif;
  color: var(--text-color);
  overflow-x: hidden;
}

/* Content container: Limits width on large screens and stays centered */
.popup-content-container, .popup-container {
  width: 100%;
  max-width: 480px; /* Optimized for mobile/tablet */
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
  position: relative;
  box-sizing: border-box;
  
  /* Desktop Popup Specific (Extension Mode) */
  @media (min-width: 481px) {
    max-width: 400px; /* Standard extension width */
    height: auto;
    max-height: 600px;
    min-height: 350px;
    border-radius: 6px;
    margin: 10px 0; /* Centering vertically on large screens if needed */
  }

  /* On very small desktop popups, we don't want the shadow or fixed height */
  @media (max-width: 500px) and (max-height: 650px) {
    max-height: 600px;
    height: auto;
    min-height: 350px;
    box-shadow: none;
    margin: 0;
  }
}

/* Header section remains visible during scroll */
.sticky-header {
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-color);
  border-bottom: 1px solid var(--header-border-color);
}

/* Main form area that can scroll if content exceeds viewport */
.translation-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
}

.loading-container, .error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  flex: 1;
}

.loading-text {
  font-size: 14px;
  opacity: 0.7;
}

.error-message {
  color: var(--text-color);
  opacity: 0.8;
  margin: 0;
  text-align: center;
}

.retry-button {
  padding: 0.5rem 1rem;
  background-color: var(--toolbar-link-color);
  color: var(--bg-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.language-controls {
  display: grid;
  grid-template-columns: 100px minmax(0, 1fr); /* Strictly constrain the second column */
  align-items: center;
  padding: 4px 12px;
  gap: 12px;
  background: var(--language-controls-bg-color);
  min-height: 38px;
  box-sizing: border-box;
  width: 100%;
  overflow: hidden; /* Prevent any child from leaking out */

  @media (max-width: 480px) {
    padding: 8px 12px;
    grid-template-columns: 140px minmax(0, 1fr);
  }

  /* Responsive stacking for narrow containers */
  @media (max-width: 350px) {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 12px;
    gap: 12px;
  }
}
</style>