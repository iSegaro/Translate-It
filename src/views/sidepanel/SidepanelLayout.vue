<template>
  <div
    class="sidepanel-container"
    @click="handleSidepanelClick"
  >
    <!-- Side Toolbar -->
    <SidepanelToolbar 
      :is-api-dropdown-visible="isApiDropdownVisible"
      :is-history-visible="isHistoryVisible"
      @history-toggle="handleHistoryToggle"
      @api-dropdown-toggle="handleApiDropdownToggle"
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

    <!-- API Provider Dropdown -->
    <SidepanelApiDropdown 
      v-model:is-visible="isApiDropdownVisible"
      @close="isApiDropdownVisible = false"
      @provider-selected="handleProviderSelect"
    />
  </div>
</template>

<script setup>
import { useTranslationStore } from '@/store/modules/translation';
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useApiProvider } from '@/composables/useApiProvider.js';
import { useHistory } from '@/composables/useHistory.js';
import { useSelectElementTranslation } from '@/composables/useTranslationModes.js';
import SidepanelApiDropdown from './components/SidepanelApiDropdown.vue';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelToolbar from './components/SidepanelToolbar.vue';

// Get composables to sync state
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const { closeDropdown: closeApiDropdown, setDropdownOpen } = useApiProvider()
const { isSelectModeActive, deactivateSelectMode } = useSelectElementTranslation()
const translationStore = useTranslationStore()

// Shared state between components
const isHistoryVisible = ref(false)
const isApiDropdownVisible = ref(false)

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

// Handle API dropdown toggle
const handleApiDropdownToggle = (visible) => {
  isApiDropdownVisible.value = visible
}

// Watch for changes in isApiDropdownVisible and sync with composable
watch(isApiDropdownVisible, (newVal) => {
  setDropdownOpen(newVal)
})

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

// Handle API provider selection
const handleProviderSelect = (providerId) => {
  console.log('[SidepanelLayout] Provider selected:', providerId)
  isApiDropdownVisible.value = false
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
