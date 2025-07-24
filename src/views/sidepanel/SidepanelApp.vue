<template>
  <div class="extension-sidepanel">
    <div v-if="isLoading" class="loading-container">
      <LoadingSpinner size="lg" />
      <span class="loading-text">Loading Sidepanel...</span>
    </div>
    
    <template v-else>
      <!-- Sidepanel Header -->
      <SidepanelHeader 
        :extension-enabled="settingsStore.extensionEnabled"
        @toggle-extension="handleToggleExtension"
      />
      
      <!-- Main Content Area -->
      <div class="sidepanel-content">
        <!-- Translation Interface -->
        <TranslationBox
          mode="sidepanel"
          :disabled="!settingsStore.canTranslate"
          @translate="handleTranslation"
        />
        
        <!-- Advanced Features -->
        <AdvancedFeatures
          v-if="showAdvancedFeatures"
          :can-translate="settingsStore.canTranslate"
          @screen-capture="handleScreenCapture"
          @tts-toggle="handleTTSToggle"
        />
        
        <!-- Translation History -->
        <TranslationHistory
          v-if="showHistory"
          @retranslate="handleRetranslate"
          @clear-history="handleClearHistory"
        />
      </div>
      
      <!-- Footer with Settings -->
      <SidepanelFooter 
        @open-options="handleOpenOptions"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useExtensionAPI } from '@/composables/useExtensionAPI'
import LoadingSpinner from '@/components/base/LoadingSpinner.vue'
import SidepanelHeader from '@/components/layout/SidepanelHeader.vue'
import SidepanelFooter from '@/components/layout/SidepanelFooter.vue'
import TranslationBox from '@/components/feature/TranslationBox.vue'
import AdvancedFeatures from '@/components/feature/AdvancedFeatures.vue'
import TranslationHistory from '@/components/feature/TranslationHistory.vue'

// Stores
const settingsStore = useSettingsStore()

// Composables
const { sendMessage } = useExtensionAPI()

// State
const isLoading = ref(true)
const showAdvancedFeatures = ref(true)
const showHistory = ref(true)

// Computed
const canTranslate = computed(() => settingsStore.canTranslate)

// Methods
const handleToggleExtension = async (enabled) => {
  try {
    await settingsStore.updateSetting('extensionEnabled', enabled)
    await sendMessage('EXTENSION_TOGGLED', { enabled })
  } catch (error) {
    console.error('Failed to toggle extension:', error)
  }
}

const handleTranslation = async (result) => {
  console.log('Translation completed in sidepanel:', result)
  // Could trigger history update, notifications, etc.
}

const handleScreenCapture = async () => {
  try {
    await sendMessage('START_SCREEN_CAPTURE')
  } catch (error) {
    console.error('Failed to start screen capture:', error)
  }
}

const handleTTSToggle = async (text, language) => {
  try {
    await sendMessage('TOGGLE_TTS', { text, language })
  } catch (error) {
    console.error('Failed to toggle TTS:', error)
  }
}

const handleRetranslate = async (historyItem) => {
  try {
    // Trigger retranslation of history item
    await sendMessage('RETRANSLATE', { historyItem })
  } catch (error) {
    console.error('Failed to retranslate:', error)
  }
}

const handleClearHistory = async () => {
  try {
    await sendMessage('CLEAR_HISTORY')
  } catch (error) {
    console.error('Failed to clear history:', error)
  }
}

const handleOpenOptions = async () => {
  try {
    await sendMessage('OPEN_OPTIONS_PAGE')
  } catch (error) {
    console.error('Failed to open options:', error)
  }
}

// Lifecycle
onMounted(async () => {
  try {
    // Wait for settings to load
    await settingsStore.loadSettings()
    
    // Initialize sidepanel-specific features
    await initializeSidepanel()
  } catch (error) {
    console.error('Failed to initialize sidepanel:', error)
  } finally {
    isLoading.value = false
  }
})

const initializeSidepanel = async () => {
  try {
    // Load advanced features
    const { loadAdvancedFeatures } = await import('@/app/main/sidepanel.js')
    await loadAdvancedFeatures()
  } catch (error) {
    console.warn('Failed to load advanced features:', error)
  }
}
</script>

<style scoped>
.extension-sidepanel {
  width: 100%;
  height: 100vh;
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

.sidepanel-content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
</style>