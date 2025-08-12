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
        <LanguageControls :disabled="!canTranslateFromForm" />
      </div>
      
      <!-- Scrollable Content Section -->
      <div class="scrollable-content">
        <TranslationForm @can-translate-change="canTranslateFromForm = $event" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import PopupHeader from '@/components/popup/PopupHeader.vue'
import LanguageControls from '@/components/popup/LanguageControls.vue'
import TranslationForm from '@/components/popup/TranslationForm.vue'
import browser from 'webextension-polyfill'
import { applyTheme } from '@/utils/ui/theme.js'

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

// Lifecycle
onMounted(async () => {
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
    
    // Step 3: Test background connection with simple ping
    try {
      const response = await sendMessage({ action: 'ping', data: { from: 'popup' } })
    } catch (err) {
      const isSilent = await handleError(err, 'popup-connection-test', { silent: true })
      if (!isSilent) {
        // Only warn for non-context errors
      }
    }
    
    // Step 4: Apply theme
    const settings = settingsStore.settings
    await applyTheme(settings.THEME)
    
  } catch (error) {
    const isSilent = await handleError(error, 'popup-initialization')
    if (!isSilent) {
      hasError.value = true
      errorMessage.value = error.message || 'Unknown error occurred'
    }
  } finally {
    isLoading.value = false
  }
})

const retryLoading = () => {
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
</style>