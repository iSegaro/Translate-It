<template>
  <header class="popup-header">
    <div class="header-content">
      <div class="logo-section">
        <div class="logo">
          🌐
        </div>
        <h1 class="title">
          Translate It
        </h1>
      </div>
      
      <div class="actions-section">
        <BaseButton
          variant="ghost"
          size="sm"
          :icon="extensionEnabled ? 'pause' : 'play'"
          :title="extensionEnabled ? 'Disable Extension' : 'Enable Extension'"
          @click="handleToggle"
        />
        
        <BaseButton
          variant="ghost"
          size="sm"
          icon="settings"
          title="Open Settings"
          @click="$emit('open-settings')"
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

const emit = defineEmits(['toggle-extension', 'open-settings'])

const handleToggle = () => {
  emit('toggle-extension')
}
</script>

<style scoped>
.popup-header {
  background-color: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  padding: 12px 16px;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.title {
  font-size: var(--font-size-md);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text);
  margin: 0;
}

.actions-section {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>