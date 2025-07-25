<template>
  <div class="extension-options">
    <div v-if="isLoading" class="loading-container">
      <LoadingSpinner size="xl" />
      <span class="loading-text">{{ loadingText }}</span>
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
import { getBrowserAPI } from '@/utils/browser-unified.js'

// Stores
const settingsStore = useSettingsStore()

// State
const isLoading = ref(true)
const loadingText = ref('Loading Settings...')

// Lifecycle
onMounted(async () => {
  try {
    // Set loading text
    const browser = await getBrowserAPI()
    loadingText.value = browser.i18n.getMessage('options_loading') || 'Loading Settings...'
    
    // Wait for settings to load
    await settingsStore.loadSettings()
    
    // Initialize options-specific features
    await initializeOptions()
  } catch (error) {
    console.error('Failed to initialize options:', error)
  } finally {
    isLoading.value = false
  }
})

const initializeOptions = async () => {
  try {
    // Load settings modules
    const { loadSettingsModules } = await import('@/app/main/options.js')
    await loadSettingsModules()
  } catch (error) {
    console.warn('Failed to load settings modules:', error)
  }
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
</style>