<template>
  <div
    class="sidepanel-container"
    @click="handleSidepanelClick"
  >
    <!-- Side Toolbar -->
    <SidepanelToolbar 
      :is-history-visible="isHistoryVisible"
      @history-toggle="handleHistoryToggle"
      @clear-fields="handleClearFields"
    />

    <!-- Content area -->
    <div class="content-area">
      <!-- Main Content -->
      <SidepanelMainContent v-if="!useEnhancedVersion" />
      <EnhancedSidepanelMainContent v-else />

      <!-- History Panel -->
      <SidepanelHistory 
        v-model:is-visible="isHistoryVisible"
        @close="handleHistoryClose"
        @select-history-item="handleHistoryItemSelect"
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
  </div>
</template>

<script setup>
import { useTranslationStore } from '@/features/translation/stores/translation.js';
import { onMounted, onUnmounted, ref, watch, computed } from 'vue';
import { useHistory } from '@/features/history/composables/useHistory.js';
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import EnhancedSidepanelMainContent from './components/EnhancedSidepanelMainContent.vue';
import SidepanelToolbar from './components/SidepanelToolbar.vue';
import { Icon } from '@iconify/vue';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelLayout');

// Get composables to sync state
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()
const translationStore = useTranslationStore()
const { handleError } = useErrorHandler()

// Shared state between components
const isHistoryVisible = ref(false)

// Enhanced version toggle
const useEnhancedVersion = ref(false) // Default to original version
const isDevelopment = computed(() => {
  return import.meta.env.MODE === 'development' || 
         window.location.hostname === 'localhost' ||
         localStorage.getItem('dev-mode') === 'true'
})

const toggleEnhancedVersion = () => {
  useEnhancedVersion.value = !useEnhancedVersion.value
  localStorage.setItem('sidepanel-enhanced-version', useEnhancedVersion.value.toString())
  logger.debug('[SidepanelLayout] Enhanced version toggled:', useEnhancedVersion.value)
}

// Handle history panel toggle
const handleHistoryToggle = (visible) => {
  isHistoryVisible.value = visible
  if (visible) {
    openHistoryPanel()
  } else {
    closeHistoryPanel()
  }
}

// Handle history panel close
const handleHistoryClose = () => {
  isHistoryVisible.value = false
  closeHistoryPanel() // Sync with composable state
}

// Watch for changes in isHistoryVisible and sync with composable
watch(isHistoryVisible, (newVal) => {
  setHistoryPanelOpen(newVal)
})

// Handle clear fields event from toolbar
const handleClearFields = () => {
  // Clear translation store
  translationStore.currentTranslation = null;
  translationStore.clearError();
  
  // Emit clear-fields event to main content component
  const event = new CustomEvent('clear-fields')
  document.dispatchEvent(event)
}

// Handle history item selection
const handleHistoryItemSelect = (historyData) => {
  logger.debug('[SidepanelLayout] History item selected:', historyData)
  
  // Update translation store with the selected history item
  translationStore.currentTranslation = {
    sourceText: historyData.sourceText,
    translatedText: historyData.translatedText,
    sourceLanguage: historyData.sourceLanguage,
    targetLanguage: historyData.targetLanguage,
    timestamp: Date.now()
  }
  
  // Close history panel after selection
  isHistoryVisible.value = false
  closeHistoryPanel()
}


// Handle sidepanel click to deactivate select element mode
const handleSidepanelClick = async () => {
  // Only deactivate if select mode is active
  if (isSelectModeActive.value) {
    try {
      await deactivateSelectMode()
    } catch (error) {
      await handleError(error, 'sidepanel-select-deactivate')
    }
  }
}

// Handle ESC key in sidepanel
const handleKeyDown = async (event) => {
  if (event.key !== 'Escape') return
  if (isSelectModeActive.value) {
    try {
      event.preventDefault()
      event.stopPropagation()
      await deactivateSelectMode()
    } catch (error) {
      await handleError(error, 'sidepanel-esc-deactivate')
    }
  }
}

// Lifecycle management for ESC listener
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, { capture: true })
  
  // Load saved version preference
  const savedVersion = localStorage.getItem('sidepanel-enhanced-version')
  if (savedVersion !== null) {
    useEnhancedVersion.value = savedVersion === 'true'
  }
  
  logger.debug('[SidepanelLayout] Component initialized', {
    useEnhancedVersion: useEnhancedVersion.value,
    isDevelopment: isDevelopment.value
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown, { capture: true })
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.sidepanel-container {
  display: flex;
  height: 100vh;
  width: 100%;
  background-color: var(--bg-color);
  color: var(--text-color);
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

.content-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  width: 100%;
  min-width: 0; // Important for preventing overflow
}

.side-toolbar {
  width: 50px;
  background-color: var(--color-surface-alt);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-right: 1px solid var(--color-border);
}

/* Scoped styles for the sidepanel container */
.extension-sidepanel {
  width: 100%;
  height: 100vh;
  overflow-y: auto;
}
</style>
