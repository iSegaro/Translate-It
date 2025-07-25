<template>
  <div id="apiProviderDropdown" class="dropdown-menu">
    <!-- Dynamic provider options will be loaded here by sidepanel.js -->
  </div>
</template>

<script setup>
// Add script logic here later
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.dropdown-menu {
  position: absolute;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: $border-radius-md;
  box-shadow: $shadow-md;
  padding: $spacing-xs;
  z-index: 200;
  display: none; /* Managed by JS */
  flex-direction: column;
  gap: $spacing-xs;
}
</style>
