<template>
  <div class="theme-selector">
    <div class="theme-control-group">
      <div class="theme-switch-row">
        <!-- Sun icon -->
        <svg
          class="theme-icon-svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>

        <label
          class="switch"
          :title="$i18n('theme_toggle_title') || 'Toggle Light/Dark Theme'"
        >
          <input 
            type="checkbox" 
            v-model="isDarkMode" 
            :disabled="isAutoMode"
          />
          <span class="slider round"></span>
        </label>

        <!-- Moon icon -->
        <svg
          class="theme-icon-svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
      </div>
      
      <label class="theme-auto-label">
        <input type="checkbox" v-model="isAutoMode" />
        <span>{{ $i18n('theme_auto') || 'System Theme' }}</span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useSettingsStore } from '@/store/core/settings'

const settingsStore = useSettingsStore()

// Theme state management
const isDarkMode = computed({
  get: () => settingsStore.theme === 'dark',
  set: (value) => {
    if (!isAutoMode.value) {
      settingsStore.updateSetting('theme', value ? 'dark' : 'light')
    }
  }
})

const isAutoMode = computed({
  get: () => settingsStore.theme === 'auto',
  set: (value) => {
    if (value) {
      settingsStore.updateSetting('theme', 'auto')
    } else {
      // When disabling auto mode, set to current system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      settingsStore.updateSetting('theme', prefersDark ? 'dark' : 'light')
    }
  }
})

// Apply theme to document
const applyTheme = (theme) => {
  const root = document.documentElement
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.className = prefersDark ? 'theme-dark' : 'theme-light'
  } else {
    root.className = `theme-${theme}`
  }
}

// Watch for theme changes
watch(() => settingsStore.theme, (newTheme) => {
  applyTheme(newTheme)
}, { immediate: true })

// Listen for system theme changes when in auto mode
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
mediaQuery.addEventListener('change', () => {
  if (settingsStore.theme === 'auto') {
    applyTheme('auto')
  }
})
</script>

<style lang="scss" scoped>
@import '@/assets/styles/variables.scss';

.theme-control-group {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: $spacing-base;
}

.theme-switch-row {
  display: flex;
  align-items: center;
  gap: $spacing-base;
}

.theme-icon-svg {
  width: 20px;
  height: 20px;
  color: var(--color-text-secondary);
  opacity: 0.7;
}

.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  
  input {
    opacity: 0;
    width: 0;
    height: 0;
  }
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: $transition-base;
  border-radius: 20px;
  
  &:before {
    position: absolute;
    content: "";
    height: 16px;
    width: 16px;
    left: 2px;
    bottom: 2px;
    background-color: white;
    transition: $transition-base;
    border-radius: 50%;
  }
}

input:checked + .slider {
  background-color: var(--color-primary);
}

input:checked + .slider:before {
  transform: translateX(20px);
}

input:disabled + .slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.theme-auto-label {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-size-sm;
  font-weight: $font-weight-normal;
  cursor: pointer;
  margin-bottom: 0;
  padding: $spacing-xs;
  
  input[type="checkbox"] {
    margin: 0;
    width: 16px;
    height: 16px;
  }
}

// RTL Support
.rtl .theme-switch-row {
  flex-direction: row-reverse;
}
</style>