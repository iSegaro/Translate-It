<template>
  <div class="extension-options">
    <div v-if="isLoading" class="loading-container">
      <LoadingSpinner size="xl" />
      <span class="loading-text">{{ loadingText }}</span>
    </div>
    
    <div v-else-if="hasError" class="error-container">
      <div class="error-icon">⚠️</div>
      <h2>Failed to Load Options</h2>
      <p class="error-message">{{ errorMessage }}</p>
      <button @click="retryLoading" class="retry-button">Retry</button>
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
import browser from 'webextension-polyfill'
import { loadSettingsModules } from '@/utils/settings-modules.js'

// Stores
const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)
const loadingText = ref('Loading Settings...')
const hasError = ref(false)
const errorMessage = ref('')

// Lifecycle
onMounted(async () => {
  console.log('🚀 OptionsApp mounting...')
  
  try {
    // Step 1: Set loading text
    console.log('📝 Setting loading text...')
    loadingText.value = browser.i18n.getMessage('options_loading') || 'Loading Settings...'
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
    
    // Step 3: Load additional modules
    console.log('🔧 Loading additional modules...')
    await initializeOptions()
    console.log('✅ Additional modules loaded')
    
  } catch (error) {
    console.error('❌ Failed to initialize options:', error)
    hasError.value = true
    errorMessage.value = error.message || 'Unknown error occurred'
  } finally {
    console.log('✨ OptionsApp initialization complete')
    isLoading.value = false
  }
})

const initializeOptions = async () => {
  try {
    await loadSettingsModules()
  } catch (error) {
    console.warn('⚠️ Failed to load settings modules:', error)
    // Don't throw - this is optional
  }
}

const retryLoading = () => {
  console.log('🔄 Retrying options loading...')
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
.extension-options {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: var(--color-background);
  padding: 20px;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
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