<template>
  <div class="popup-wrapper">
    <div
      v-if="isLoading"
      class="popup-container"
    >
      <div class="loading-container">
        <LoadingSpinner size="sm" />
        <span class="loading-text">{{ loadingText }}</span>
      </div>
    </div>
    
    <div
      v-else-if="hasError"
      class="popup-container"
    >
      <div class="error-container">
        <div class="error-icon">
          ⚠️
        </div>
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
    </div>
    
    <template v-else>
      <!-- Sticky Header Section -->
      <div class="sticky-header">
        <PopupHeader />
        <div class="language-controls">
          <!-- Provider Selector -->
          <ProviderSelector
            mode="split"
            :disabled="!canTranslateFromForm"
            @translate="handleTranslate"
            @provider-change="handleProviderChange"
          />

          <!-- Language Selector -->
          <LanguageSelector
            v-model:source-language="sourceLanguage"
            v-model:target-language="targetLanguage"
            :source-title="$i18n('popup_source_language_title') || 'زبان مبدا'"
            :target-title="$i18n('popup_target_language_title') || 'زبان مقصد'"
            :swap-title="$i18n('popup_swap_languages_title') || 'جابجایی زبان‌ها'"
            :swap-alt="$i18n('popup_swap_languages_alt_icon') || 'Swap'"
            :auto-detect-label="'Auto-Detect'"
          />
        </div>
      </div>
      
      <!-- Scrollable Content Section -->
      <div class="scrollable-content">
        <!-- Original TranslationForm -->
        <TranslationForm 
          v-if="!useEnhancedVersion"
          @can-translate-change="canTranslateFromForm = $event" 
        />
        
        <!-- Enhanced TranslationForm with new ActionSystem -->
        <EnhancedTranslationForm 
          v-else
          @can-translate-change="canTranslateFromForm = $event" 
        />
      </div>
      
      <!-- Development Toggle -->
      <div
        v-if="isDevelopment"
        class="enhanced-version-toggle"
        @click="toggleEnhancedVersion"
      >
        <Icon
          v-if="useEnhancedVersion"
          icon="fa6-solid:toggle-on"
        />
        <Icon
          v-else
          icon="fa6-solid:toggle-off"
        />
        <span>{{ useEnhancedVersion ? 'Enhanced' : 'Classic' }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import PopupHeader from '@/components/popup/PopupHeader.vue'
import LanguageSelector from '@/components/shared/LanguageSelector.vue'
import ProviderSelector from '@/components/shared/ProviderSelector.vue'
import TranslationForm from '@/components/popup/TranslationForm.vue'
import EnhancedTranslationForm from '@/components/popup/EnhancedTranslationFormClassic.vue'
import { Icon } from '@iconify/vue'
import browser from 'webextension-polyfill'
import { applyTheme } from '@/utils/ui/theme.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'
import { AUTO_DETECT_VALUE } from '@/constants.js'
import { getSourceLanguageAsync, getTargetLanguageAsync } from '@/config.js'
import { getLanguageDisplayName } from '@/utils/i18n/languages.js'
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupApp')

// Stores & Composables
const settingsStore = useSettingsStore()
const { sendMessage } = useMessaging('popup')
const { handleError } = useErrorHandler()

// State
const isLoading = ref(true)
const loadingText = ref('Initializing...')
const hasError = ref(false)
const errorMessage = ref('')
const canTranslateFromForm = ref(false)

// Language state management - matching sidepanel approach
const sourceLanguage = ref(AUTO_DETECT_VALUE)
const targetLanguage = ref('Farsi')

// Enhanced version toggle
const useEnhancedVersion = ref(false) // Default to original version
const isDevelopment = computed(() => {
  return import.meta.env.MODE === 'development' || 
         window.location.hostname === 'localhost' ||
         localStorage.getItem('dev-mode') === 'true'
})

// Event Handlers
const handleTranslate = (data) => {
  logger.debug("[PopupApp] 🎯 Translate button clicked from ProviderSelector");
  // Emit to translation forms
  const event = new CustomEvent('translate-request', { detail: data })
  document.dispatchEvent(event)
}

const handleProviderChange = (provider) => {
  logger.info("[PopupApp] 🔄 Provider changed to:", provider);
  // Emit to translation forms
  const event = new CustomEvent('provider-changed', { detail: { provider } })
  document.dispatchEvent(event)
}

// Methods
const toggleEnhancedVersion = () => {
  logger.debug('🔄 Enhanced Version toggle clicked! Current:', useEnhancedVersion.value ? 'Enhanced' : 'Original')
  useEnhancedVersion.value = !useEnhancedVersion.value
  logger.debug('[PopupApp] Switched to version:', useEnhancedVersion.value ? 'Enhanced' : 'Original')
  
  // Store preference
  localStorage.setItem('popup-enhanced-version', useEnhancedVersion.value.toString())
}

// Lifecycle
onMounted(() => {
  const initialize = async () => {
  try {
    // Step 1: Set loading text
    loadingText.value = browser.i18n.getMessage('popup_loading') || 'Loading Popup...'
    
    // Step 2: Load settings store
    await Promise.race([
      settingsStore.loadSettings(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings loading timeout')), 10000)
      )
    ])
    
    // Step 3: Apply theme
    const settings = settingsStore.settings
    await applyTheme(settings.THEME)
    
    // Step 4: Check for saved version preference
    const savedVersion = localStorage.getItem('popup-enhanced-version')
    if (savedVersion !== null) {
      useEnhancedVersion.value = savedVersion === 'true'
    }
    
    // Initialize language refs with saved settings (matching sidepanel approach)
    try {
      const savedSource = await getSourceLanguageAsync()
      const savedTarget = await getTargetLanguageAsync()
      sourceLanguage.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || AUTO_DETECT_VALUE
      targetLanguage.value = getLanguageDisplayName(savedTarget) || 'Farsi'
      logger.debug("✅ Languages initialized from settings:", savedSource, "→", savedTarget)
    } catch (err) {
      logger.warn("Error loading language settings:", err)
      sourceLanguage.value = getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect'
      targetLanguage.value = 'English'
    }
    
    // Add clear-storage event listener to reset languages (matching sidepanel approach)
    document.addEventListener('clear-storage', async () => {
      logger.debug("🔄 Clear storage event - resetting languages to saved settings");
      try {
        const savedSource = await getSourceLanguageAsync()
        const savedTarget = await getTargetLanguageAsync()
        sourceLanguage.value = getLanguageDisplayName(savedSource) || getLanguageDisplayName(AUTO_DETECT_VALUE) || 'Auto-Detect'
        targetLanguage.value = getLanguageDisplayName(savedTarget) || 'English'
        logger.debug("✅ Languages reset to saved settings:", savedSource, "→", savedTarget)
      } catch (error) {
        logger.error("❌ Failed to reset languages:", error)
      }
    })
    
    logger.debug('[PopupApp] Popup initialized successfully', {
      useEnhancedVersion: useEnhancedVersion.value,
      isDevelopment: isDevelopment.value
    })
    
  } catch (error) {
    const isSilent = await handleError(error, 'popup-initialization')
    if (!isSilent) {
      hasError.value = true
      errorMessage.value = error.message || 'Unknown error occurred'
    }
  } finally {
    isLoading.value = false
  }
  }
  initialize()
})

const retryLoading = () => {
  logger.debug('🔄 Retry button clicked! Retrying popup initialization...')
  hasError.value = false
  errorMessage.value = ''
  isLoading.value = true
  
  // Reset store state
  settingsStore.$reset && settingsStore.$reset()
  
  // Retry mounting logic
  setTimeout(() => {
    onMounted()
  }, 100)
}
</script>

<style scoped>
/* Main popup wrapper using Flexbox */
.popup-wrapper {
  width: 100%;
  height: 100vh; /* Full viewport height */
  max-height: 600px; /* Popup maximum height */
  min-height: 350px; /* Popup minimum height */
  background: var(--bg-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: "Vazirmatn", "Segoe UI", sans-serif;
  font-size: 15px;
  color: var(--text-color);
  transition: height 0.6s cubic-bezier(0.4, 0.0, 0.2, 1);
}

/* Legacy container for loading/error states */
.popup-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Sticky header section - flex shrink */
.sticky-header {
  flex-shrink: 0; /* Don't shrink */
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--bg-color);
  border-bottom: 1px solid var(--header-border-color);
}

/* Scrollable content section - flex grow and scroll */
.scrollable-content {
  flex: 1; /* Take remaining space */
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* Important: allows flex item to shrink */
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
  min-height: 200px;
}

.loading-text {
  font-size: 14px;
  color: var(--text-color);
  opacity: 0.7;
}

.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 2rem;
  text-align: center;
  min-height: 200px;
}

.error-icon {
  font-size: 2rem;
}

.error-message {
  color: var(--text-color);
  opacity: 0.8;
  margin: 0;
}

.retry-button {
  padding: 0.5rem 1rem;
  background-color: var(--toolbar-link-color);
  color: var(--bg-color);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}

.retry-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
}

.enhanced-version-toggle {
  position: fixed;
  top: 8px;
  right: 8px;
  background: rgba(var(--color-bg-secondary-rgb), 0.9);
  border: 1px solid rgba(var(--color-border-rgb), 0.3);
  border-radius: 12px;
  padding: 4px 8px;
  font-size: 10px;
  cursor: pointer;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 4px;
  backdrop-filter: blur(4px);
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(var(--color-bg-secondary-rgb), 1);
    border-color: rgba(var(--color-border-rgb), 0.5);
    transform: scale(1.05);
  }
  
  span {
    font-weight: 500;
    color: var(--color-text-secondary);
  }
  
  .iconify {
    font-size: 12px;
    color: var(--color-primary);
  }
}

.language-controls {
  display: flex;
  align-items: center;
  padding: 3px 12px;
  margin: 0;
  gap: 4px;
  background: var(--language-controls-bg-color);
  min-height: 36px;
  box-sizing: border-box;
}
</style>