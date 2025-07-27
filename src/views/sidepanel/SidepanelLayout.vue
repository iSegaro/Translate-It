<template>
  <div class="sidepanel-container" @click="handleSidepanelClick">
    <!-- Side Toolbar -->
    <SidepanelToolbar 
      @history-toggle="handleHistoryToggle"
      @api-dropdown-toggle="handleApiDropdownToggle"
      :is-api-dropdown-visible="isApiDropdownVisible"
      :is-history-visible="isHistoryVisible"
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
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useHistory } from '@/composables/useHistory.js'
import { useApiProvider } from '@/composables/useApiProvider.js'
import { useSelectElementTranslation } from '@/composables/useSelectElementTranslation.js'
import SidepanelToolbar from './components/SidepanelToolbar.vue'
import SidepanelMainContent from './components/SidepanelMainContent.vue'
import SidepanelHistory from './components/SidepanelHistory.vue'
import SidepanelApiDropdown from './components/SidepanelApiDropdown.vue'

// Get composables to sync state
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const { closeDropdown: closeApiDropdown, setDropdownOpen } = useApiProvider()
const { isSelectModeActive, deactivateSelectElement } = useSelectElementTranslation()

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
  console.log('[SidepanelLayout] isHistoryVisible toggled to:', visible)
}

// Handle history panel close
const handleHistoryClose = () => {
  isHistoryVisible.value = false
  closeHistoryPanel() // Sync with composable state
  console.log('[SidepanelLayout] handleHistoryClose: isHistoryVisible set to false')
}

// Handle API dropdown toggle
const handleApiDropdownToggle = (visible) => {
  isApiDropdownVisible.value = visible
  console.log('[SidepanelLayout] isApiDropdownVisible toggled to:', visible)
}

// Watch for changes in isApiDropdownVisible and sync with composable
watch(isApiDropdownVisible, (newVal) => {
  setDropdownOpen(newVal)
})

// Watch for changes in isHistoryVisible and sync with composable
watch(isHistoryVisible, (newVal) => {
  setHistoryPanelOpen(newVal)
})

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
      console.log('[SidepanelLayout] Sidepanel clicked - deactivating select element mode')
      await deactivateSelectElement()
    } catch (error) {
      console.error('[SidepanelLayout] Failed to deactivate select element mode:', error)
    }
  }
}

// Handle ESC key in sidepanel
const handleKeyDown = async (event) => {
  // Only handle ESC key
  if (event.key !== 'Escape') return
  
  // Only deactivate if select mode is active
  if (isSelectModeActive.value) {
    try {
      console.log('[SidepanelLayout] ESC pressed in sidepanel - deactivating select element mode')
      event.preventDefault()
      event.stopPropagation()
      await deactivateSelectElement()
    } catch (error) {
      console.error('[SidepanelLayout] Failed to deactivate select element mode on ESC:', error)
    }
  }
}

// Lifecycle management for ESC listener
onMounted(() => {
  // Add global keydown listener for ESC in sidepanel
  document.addEventListener('keydown', handleKeyDown, { capture: true })
  console.log('[SidepanelLayout] ESC listener added to sidepanel')
})

onUnmounted(() => {
  // Remove global keydown listener
  document.removeEventListener('keydown', handleKeyDown, { capture: true })
  console.log('[SidepanelLayout] ESC listener removed from sidepanel')
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
