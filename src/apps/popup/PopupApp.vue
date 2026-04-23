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
              :loading="translationFormRef?.isTranslating"
              @translate="handleTranslate"
              @cancel="handleCancel"
            />

            <!-- Language Selector: Handles source and target language selection -->
            <LanguageSelector
              v-model:source-language="sourceLanguage"
              v-model:target-language="targetLanguage"
              :provider="currentProvider"
              :beta="settingsStore.settings.DEEPL_BETA_LANGUAGES_ENABLED"
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
import './PopupApp.scss'
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
import { matchErrorToType } from '@/shared/error-management/ErrorMatcher.js';

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
 * @param {Object} data - Contains the provider ID to use
 */
const handleTranslate = (data) => {
  const activeForm = translationFormRef.value;
  if (activeForm && typeof activeForm.triggerTranslation === 'function') {
    // Pass the specific provider if available in the event data
    const providerId = data?.provider || currentProvider.value;
    activeForm.triggerTranslation(providerId);
  }
}

/**
 * Handle cancellation requests emitted from ProviderSelector
 */
const handleCancel = () => {
  const activeForm = translationFormRef.value;
  if (activeForm && typeof activeForm.cancelTranslation === 'function') {
    activeForm.cancelTranslation();
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
      errorType.value = matchErrorToType(error)
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
