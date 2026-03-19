<template>
  <div
    class="sidepanel-container"
    @keydown="handleKeydown"
  >
    <!-- Side Toolbar -->
    <SidepanelToolbar 
      v-model:current-provider="currentProvider"
      :is-history-visible="isHistoryVisible"
      @history-toggle="handleHistoryToggle"
      @clear-fields="handleClearFields"
    />

    <!-- Content area -->
    <div class="content-area">
      <!-- Main Content -->
      <SidepanelMainContent
        ref="mainContentRef"
        :provider="currentProvider"
      />

      <!-- History Panel -->
      <SidepanelHistory 
        v-model:is-visible="isHistoryVisible"
        @close="handleHistoryClose"
        @select-history-item="handleHistoryItemSelect"
      />
    </div>

    <!-- Main View Area -->
  </div>
</template>

<script setup>
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { useTranslationStore } from '@/features/translation/stores/translation.js';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useHistory } from '@/features/history/composables/useHistory.js';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelToolbar from './components/SidepanelToolbar.vue';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'SidepanelLayout');


// Get stores and composables to sync state
const settingsStore = useSettingsStore()
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const translationStore = useTranslationStore()
useErrorHandler()

// Template refs
const mainContentRef = ref(null);

// Shared state between components
const isHistoryVisible = ref(false)
const currentProvider = ref('')

// Ensure history panel is closed on mount and initialize provider
onMounted(async () => {
  isHistoryVisible.value = false
  setHistoryPanelOpen(false)

  // Wait for settings to load if not already initialized
  if (!settingsStore.isInitialized) {
    await settingsStore.loadSettings()
  }

  // Initialize current provider from settings
  if (settingsStore.settings.TRANSLATION_API && !currentProvider.value) {
    currentProvider.value = settingsStore.settings.TRANSLATION_API
    logger.debug('[SidepanelLayout] Initialized local provider:', currentProvider.value)
  }
})

// Watch for settings changes to keep local provider in sync when global setting changes
watch(() => settingsStore.settings.TRANSLATION_API, (newVal) => {
  if (newVal && newVal !== currentProvider.value) {
    currentProvider.value = newVal
    logger.debug('[SidepanelLayout] Local provider synced with global change:', newVal)
  }
})

// States
const handleHistoryToggle = (visible) => {
  // Only toggle if the value is actually changing
  if (isHistoryVisible.value !== visible) {
    isHistoryVisible.value = visible
    setHistoryPanelOpen(visible)

    if (visible) {
      openHistoryPanel()
    } else {
      closeHistoryPanel()
    }
  }
}

// Handle history panel close
const handleHistoryClose = () => {
  isHistoryVisible.value = false
  setHistoryPanelOpen(false) // Sync with composable state
  closeHistoryPanel()
}

// Watch for changes in isHistoryVisible and sync with composable
watch(isHistoryVisible, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    setHistoryPanelOpen(newVal)
  }
})

// Handle clear fields event from toolbar
const handleClearFields = () => {
  if (mainContentRef.value && typeof mainContentRef.value.clearFields === 'function') {
    mainContentRef.value.clearFields();
  }
}

// Handle history item selection
const handleHistoryItemSelect = (historyData) => {
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




// Lifecycle management
onMounted(() => {
  logger.debug('[SidepanelLayout] Component initialized')
})

onUnmounted(() => {
  // Event listener cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

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