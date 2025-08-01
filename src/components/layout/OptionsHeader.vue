<template>
  <header class="options-header">
    <div class="header-content">
      <div class="logo-section">
        <div class="logo">
          🌐
        </div>
        <div class="title-section">
          <h1 class="title">
            Translate It
          </h1>
          <span class="subtitle">Extension Settings</span>
        </div>
      </div>
      
      <div class="version-info">
        <span class="version">v0.9.1</span>
      </div>
    </div>
  </header>
</template>

<script setup>
// Component implementation
</script>

<style scoped>
.options-header {
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 20px 24px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.logo {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  background-color: var(--color-primary);
  color: white;
}

.title-section {
  display: flex;
  flex-direction: column;
}

.title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-bold);
  color: var(--color-text);
  margin: 0;
}

.subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.version-info {
  display: flex;
  align-items: center;
}

.version {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-family: monospace;
}
</style>