<template>
  <div class="sidepanel-container">
    <!-- Side Toolbar -->
    <SidepanelToolbar />

    <!-- Content area -->
    <div class="content-area">
      <!-- Main Content -->
      <SidepanelMainContent />

      <!-- History Panel -->
      <SidepanelHistory />
    </div>

    <!-- API Provider Dropdown -->
    <SidepanelApiDropdown />
  </div>
</template>

<script setup>
import SidepanelToolbar from './components/SidepanelToolbar.vue';
import SidepanelMainContent from './components/SidepanelMainContent.vue';
import SidepanelHistory from './components/SidepanelHistory.vue';
import SidepanelApiDropdown from './components/SidepanelApiDropdown.vue';
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.sidepanel-container {
  display: flex;
  height: 100vh;
  width: 100%;
  background-color: var(--color-background);
  color: var(--color-text);
}

.content-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; // Ensures content doesn't overflow
  position: relative; // For absolute positioning of history panel
}
</style>
