<template>
  <div class="sidepanel-container">
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
import { ref, watch } from 'vue'
import { useHistory } from '@/composables/useHistory.js'
import { useApiProvider } from '@/composables/useApiProvider.js'
import SidepanelToolbar from './components/SidepanelToolbar.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelApiDropdown from './components/SidepanelApiDropdown.vue';

// Get composables to sync state
const { closeHistoryPanel, openHistoryPanel, setHistoryPanelOpen } = useHistory()
const { closeDropdown: closeApiDropdown, setDropdownOpen } = useApiProvider()

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
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.sidepanel-container {
  display: flex;
  height: 100vh;
  width: 100%;
  background-color: var(--color-background);
  color: var(--color-text);
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
