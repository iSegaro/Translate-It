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
      <SidepanelMainContent />

      <!-- History Panel -->
      <SidepanelHistory 
        v-model:is-visible="isHistoryVisible"
        @close="handleHistoryClose"
        @select-history-item="handleHistoryItemSelect"
      />
    </div>
  </div>
</template>

<script setup>
import { useTranslationStore } from '@/store/modules/translation';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useHistory } from '@/composables/useHistory.js';
import { useSelectElementTranslation } from '@/composables/useTranslationModes.js';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelToolbar from './components/SidepanelToolbar.vue';

// Get composables to sync state
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()
const translationStore = useTranslationStore()

// Shared state between components
const isHistoryVisible = ref(false)

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
  translationStore.currentTranslation = null;
  translationStore.clearError();
}

// Handle history item selection
const handleHistoryItemSelect = (item) => {
  // This will be handled by the main content component
  console.log('[SidepanelLayout] History item selected:', item)
}


// Handle sidepanel click to deactivate select element mode
const handleSidepanelClick = async (event) => {
  // Only deactivate if select mode is active
  if (isSelectModeActive.value) {
    try {
      await deactivateSelectMode()
    } catch (error) {
      console.error('[SidepanelLayout] Failed to deactivate select element mode:', error)
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
      console.error('[SidepanelLayout] Failed to deactivate select element mode on ESC:', error)
    }
  }
}

// Lifecycle management for ESC listener
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown, { capture: true })
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
  position: relative;
  overflow: hidden;
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
</style>
