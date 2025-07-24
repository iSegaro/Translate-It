<template>
  <nav class="options-navigation">
    <ul class="nav-list">
      <li 
        v-for="item in navigationItems" 
        :key="item.name"
        class="nav-item"
      >
        <button
          :class="['nav-link', { active: currentRoute === item.name }]"
          @click="$emit('navigate', item.name)"
        >
          <span :class="`icon-${item.icon}`" class="nav-icon" />
          <span class="nav-text">{{ item.label }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  currentRoute: {
    type: String,
    required: true
  }
})

defineEmits(['navigate'])

const navigationItems = ref([
  { name: 'general', label: 'General', icon: 'settings' },
  { name: 'providers', label: 'Translation Providers', icon: 'translate' },
  { name: 'advanced', label: 'Advanced', icon: 'gear' },
  { name: 'about', label: 'About', icon: 'info' }
])
</script>

<style scoped>
.options-navigation {
  width: 240px;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  flex-shrink: 0;
}

.nav-list {
  list-style: none;
  padding: 16px 0;
  margin: 0;
}

.nav-item {
  margin: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 12px 20px;
  border: none;
  background: none;
  color: var(--color-text);
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
  transition: all var(--transition-base);
  
  &:hover {
    background-color: var(--color-background);
  }
  
  &.active {
    background-color: var(--color-primary);
    color: white;
  }
}

.nav-icon {
  width: 20px;
  height: 20px;
  margin-right: 12px;
  flex-shrink: 0;
}

.nav-text {
  flex: 1;
}

@media (max-width: 768px) {
  .options-navigation {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
  
  .nav-list {
    display: flex;
    overflow-x: auto;
    padding: 8px 0;
  }
  
  .nav-item {
    flex-shrink: 0;
  }
  
  .nav-link {
    padding: 8px 16px;
    white-space: nowrap;
  }
}
</style>