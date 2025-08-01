<template>
  <div class="popup-container">
    <div
      v-if="isLoading"
      class="loading-container"
    >
      <LoadingSpinner size="sm" />
      <span class="loading-text">{{ loadingText }}</span>
    </div>
    
    <div
      v-else-if="hasError"
      class="error-container"
    >
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
    
    <template v-else>
      <!-- Header Toolbar -->
      <PopupHeader />
      
      <!-- Language Controls -->
      <LanguageControls />
      
      <!-- Translation Form -->
      <TranslationForm />
      
      <!-- Provider selector is now integrated into LanguageControls -->
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useMessaging } from '@/composables/useMessaging.js'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import PopupHeader from '@/components/popup/PopupHeader.vue'
import LanguageControls from '@/components/popup/LanguageControls.vue'
import TranslationForm from '@/components/popup/TranslationForm.vue'
import browser from 'webextension-polyfill'
import { applyTheme } from '@/utils/theme.js'

// Stores
const settingsStore = useSettingsStore()
const { sendMessage } = useMessaging('popup')

// State
const isLoading = ref(true)
const loadingText = ref('Initializing...')
const hasError = ref(false)
const errorMessage = ref('')

// Lifecycle
onMounted(async () => {
  console.log('🚀 PopupApp mounting...')
  
  try {
    // Step 1: Set loading text
    console.log('📝 Setting loading text...')
    loadingText.value = browser.i18n.getMessage('popup_loading') || 'Loading Popup...'
    console.log('✅ Loading text set')
    
    // Step 2: Load settings store
    console.log('⚙️ Loading settings store...')
    await Promise.race([
      settingsStore.loadSettings(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Settings loading timeout')), 10000)
      )
    ])
    console.log('✅ Settings store loaded')
    
    // Step 3: Test background connection with simple ping
    console.log('🔗 Testing background connection...')
    try {
      const response = await sendMessage({ action: 'ping', data: { from: 'popup' } })
      console.log('✅ Background connection test success:', response)
    } catch (err) {
      console.warn('⚠️ Background connection test failed:', err.message)
      // Don't fail initialization for this - background might be starting
    }
    
    // Step 4: Apply theme
    console.log('🎨 Applying theme...')
    const settings = settingsStore.settings
    await applyTheme(settings.THEME)
    console.log('✅ Theme applied')
    
  } catch (error) {
    console.error('❌ Failed to initialize popup:', error)
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
  } finally {
    console.log('✨ PopupApp initialization complete')
    isLoading.value = false
  }
})

const retryLoading = () => {
  console.log('🔄 Retrying popup loading...')
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
.popup-container {
  width: 100%;
  height: 100%;
  background: var(--bg-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  font-family: "Vazirmatn", "Segoe UI", sans-serif;
  font-size: 15px;
  color: var(--text-color);
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