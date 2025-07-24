<template>
  <div class="extension-popup">
    <div v-if="isLoading" class="loading-container">
      <LoadingSpinner />
      <span class="loading-text">Initializing...</span>
    </div>
    
    <template v-else>
      <!-- Header -->
      <PopupHeader 
        :extension-enabled="settingsStore.extensionEnabled"
        @toggle-extension="handleToggleExtension"
      />
      
      <!-- Main Translation Interface -->
      <TranslationBox
        mode="popup"
        :disabled="!settingsStore.canTranslate"
        @translate="handleTranslation"
      />
      
      <!-- Quick Actions -->
      <QuickActions
        :can-translate="settingsStore.canTranslate"
        @quick-translate="handleQuickTranslate"
        @open-options="handleOpenOptions"
        @open-sidepanel="handleOpenSidepanel"
      />
      
      <!-- Provider Selector -->
      <ProviderSelector
        v-model="settingsStore.selectedProvider"
        mode="compact"
        @change="handleProviderChange"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import PopupHeader from '@/components/layout/PopupHeader.vue'
import TranslationBox from '@/components/feature/TranslationBox.vue'
import QuickActions from '@/components/feature/QuickActions.vue'
import ProviderSelector from '@/components/feature/ProviderSelector.vue'
import { useExtensionAPI } from '@/composables/useExtensionAPI'

// Stores
const settingsStore = useSettingsStore()

// Composables
const { sendMessage } = useExtensionAPI()

// State
const isLoading = ref(true)

// Computed
const canTranslate = computed(() => settingsStore.canTranslate)

// Methods
const handleToggleExtension = async (enabled) => {
  try {
    await settingsStore.updateSetting('extensionEnabled', enabled)
    
    // Notify background script
    await sendMessage('EXTENSION_TOGGLED', { enabled })
  } catch (error) {
    console.error('Failed to toggle extension:', error)
  }
}

const handleTranslation = async (result) => {
  // Translation completed, could show notification or update UI
  console.log('Translation completed:', result)
}

const handleQuickTranslate = async () => {
  try {
    // Get selected text from active tab
    const response = await sendMessage('GET_SELECTED_TEXT')
    if (response?.text) {
      // Trigger translation of selected text
      // This would be handled by TranslationBox component
    }
  } catch (error) {
    console.error('Failed to get selected text:', error)
  }
}

const handleOpenOptions = async () => {
  try {
    await sendMessage('OPEN_OPTIONS_PAGE')
  } catch (error) {
    console.error('Failed to open options:', error)
  }
}

const handleOpenSidepanel = async () => {
  try {
    await sendMessage('OPEN_SIDEPANEL')
  } catch (error) {
    console.error('Failed to open sidepanel:', error)
  }
}

const handleProviderChange = async (provider) => {
  try {
    await settingsStore.updateSetting('selectedProvider', provider)
  } catch (error) {
    console.error('Failed to change provider:', error)
  }
}

// Lifecycle
onMounted(async () => {
  try {
    // Wait for settings to load
    await settingsStore.loadSettings()
    
    // Additional initialization if needed
    await initializePopup()
  } catch (error) {
    console.error('Failed to initialize popup:', error)
  } finally {
    isLoading.value = false
  }
})

const initializePopup = async () => {
  // Initialize popup-specific features
  try {
    // Load translation features
    const { loadTranslationFeatures } = await import('@/app/main/popup.js')
    await loadTranslationFeatures()
  } catch (error) {
    console.warn('Failed to load translation features:', error)
  }
}
</script>

<style scoped>
.extension-popup {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--color-background);
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  gap: 1rem;
}

.loading-text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
</style>