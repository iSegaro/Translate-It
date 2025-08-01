<template>
  <header class="sidepanel-header">
    <div class="header-content">
      <div class="logo-section">
        <div class="logo">
          🌐
        </div>
        <h1 class="title">
          Translate It
        </h1>
      </div>
      
      <div class="status-section">
        <span 
          class="status-indicator" 
          :class="{ active: extensionEnabled, inactive: !extensionEnabled }"
        >
          {{ extensionEnabled ? 'Active' : 'Disabled' }}
        </span>
        
        <BaseButton
          variant="ghost"
          size="sm"
          :icon="extensionEnabled ? 'pause' : 'play'"
          :title="extensionEnabled ? 'Disable Extension' : 'Enable Extension'"
          @click="$emit('toggle-extension', !extensionEnabled)"
        />
      </div>
    </div>
  </header>
</template>

<script setup>
import BaseButton from '@/components/base/BaseButton.vue'

defineProps({
  extensionEnabled: {
    type: Boolean,
    required: true
  }
})

defineEmits(['toggle-extension'])
</script>

<style scoped>
.sidepanel-header {
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 16px;
  flex-shrink: 0;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
}

.title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0;
}

.status-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-indicator {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  
  &.active {
    background-color: var(--color-success);
    color: white;
  }
  
  &.inactive {
    background-color: var(--color-error);
    color: white;
  }
}
</style>