<template>
  <div class="sidepanel-container">
    <!-- Side Toolbar -->
    <SidepanelToolbar 
      @history-toggle="handleHistoryToggle"
      @api-dropdown-toggle="handleApiDropdownToggle"
    />

    <!-- Content area -->
    <div class="content-area">
      <!-- Main Content -->
      <SidepanelMainContent />

      <!-- History Panel -->
      <SidepanelHistory 
        :is-visible="isHistoryVisible"
        @close="handleHistoryClose"
        @select-history-item="handleHistoryItemSelect"
      />
    </div>

    <!-- API Provider Dropdown -->
    <SidepanelApiDropdown 
      :is-visible="isApiDropdownVisible"
      @close="isApiDropdownVisible = false"
      @provider-selected="handleProviderSelect"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useHistory } from '@/composables/useHistory.js'
import SidepanelToolbar from './components/SidepanelToolbar.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelApiDropdown from './components/SidepanelApiDropdown.vue';

// Get history composable to sync state
const { closeHistoryPanel, openHistoryPanel } = useHistory()

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
