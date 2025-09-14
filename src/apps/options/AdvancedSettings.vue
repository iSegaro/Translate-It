<template>
  <div class="advanced-settings">
    <h2 class="page-title">
      Advanced Settings
    </h2>
    <p class="page-description">
      Configure advanced features and behavior
    </p>
    
    <div class="settings-section">
      <h3 class="section-title">
        Screen Capture
      </h3>
      
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            class="setting-checkbox"
          >
          <span class="setting-text">Enable Screen Capture Translation</span>
        </label>
      </div>
    </div>
    
    <div class="settings-section">
      <h3 class="section-title">
        Text to Speech
      </h3>
      
      <div class="setting-item">
        <label class="setting-label">
          <input
            type="checkbox"
            class="setting-checkbox"
          >
          <span class="setting-text">Enable Text to Speech</span>
        </label>
      </div>
    </div>
    
    </div>
</template>

<script setup>
// Component implementation
</script>

<style scoped>
.advanced-settings {
  max-width: 800px;
}

.page-title {
  font-size: var(--font-size-xxl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.page-description {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 24px 0;
}

.settings-section {
  margin-bottom: 32px;
  padding: 20px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  background-color: var(--color-background);
}

.section-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0 0 16px 0;
}

.setting-item {
  margin-bottom: 16px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.setting-checkbox {
  width: 16px;
  height: 16px;
}

.setting-text {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text);
}
</style>