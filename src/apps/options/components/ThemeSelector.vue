<template>
  <div class="theme-selector-container">
    <button
      class="theme-cycle-btn"
      :title="t('theme_toggle_title')"
      :aria-label="themeLabel"
      @click="cycleTheme"
    >
      <div class="icon-wrapper">
        <transition
          name="theme-fade"
          mode="out-in"
        >
          <img
            :key="currentTheme"
            :src="currentIcon"
            class="theme-img-icon"
            :alt="currentTheme"
          >
        </transition>
      </div>
      <span class="theme-btn-label">{{ themeLabel }}</span>
    </button>
  </div>
</template>

<script setup>
import { computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Import PNG Icons
import autoIcon from '@/icons/ui/theme-auto.png'
import darkIcon from '@/icons/ui/theme-dark.png'
import lightIcon from '@/icons/ui/theme-light.png'

const settingsStore = useSettingsStore()
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'ThemeSelector')
const { t } = useI18n()

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('theme-selector')

const currentTheme = computed(() => settingsStore.settings.THEME || 'auto')

const themeLabel = computed(() => {
  switch (currentTheme.value) {
    case 'light': return t('theme_light')
    case 'dark': return t('theme_dark')
    default: return t('theme_auto')
  }
})

const currentIcon = computed(() => {
  switch (currentTheme.value) {
    case 'light': return darkIcon
    case 'dark': return lightIcon
    default: return autoIcon
  }
})

const broadcastThemeChange = (theme) => {
  browser.runtime.sendMessage({
    action: 'THEME_CHANGED',
    payload: { theme }
  }).catch(error => {
    logger.debug('Could not send THEME_CHANGED message:', error.message);
  });
}

const setTheme = (theme) => {
  settingsStore.updateSettingAndPersist('THEME', theme)
  broadcastThemeChange(theme)
}

const cycleTheme = () => {
  let nextTheme;
  if (currentTheme.value === 'light') {
    nextTheme = 'dark'
  } else if (currentTheme.value === 'dark') {
    nextTheme = 'auto'
  } else {
    nextTheme = 'light'
  }
  setTheme(nextTheme)
}

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
watch(() => settingsStore.settings.THEME, (newTheme) => {
  applyTheme(newTheme)
}, { immediate: true })

// Listen for system theme changes when in auto mode
onMounted(() => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  tracker.addEventListener(mediaQuery, 'change', () => {
    if (settingsStore.settings.THEME === 'auto') {
      applyTheme('auto')
    }
  })
})
</script>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.theme-selector-container {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: $spacing-xs 0;
}

.theme-cycle-btn {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  background: transparent;
  border: none;
  border-radius: $border-radius-lg;
  padding: $spacing-sm $spacing-lg;
  cursor: pointer;
  transition: all $transition-base;
  min-width: 140px;
  justify-content: flex-start;

  &:hover {
    background: var(--color-surface);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
}

.icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.theme-img-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
  transition: filter $transition-base;
}

// Ensure icon visibility in dark mode (if PNGs have dark lines/fills)
:root.theme-dark .theme-img-icon,
.theme-dark .theme-img-icon {
  filter: invert(0.9) brightness(1.5);
}

.theme-btn-label {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: var(--color-text);
  white-space: nowrap;
}

/* Transition for icon change */
.theme-fade-enter-active,
.theme-fade-leave-active {
  transition: all 0.25s ease;
}

.theme-fade-enter-from,
.theme-fade-leave-to {
  opacity: 0;
  transform: rotate(-30deg) scale(0.8);
}

// Responsive adjustments for sidebar header
@media (max-width: 1024px) {
  .theme-selector-container {
    width: auto;
    padding: 0;
  }

  .theme-cycle-btn {
    min-width: auto;
    padding: $spacing-xs $spacing-sm;
    gap: $spacing-xs;
    border: none;
    background: transparent;
    box-shadow: none;

    &:hover {
      background: rgba(var(--color-primary-rgb), 0.1);
    }
  }

  .theme-btn-label {
    display: none; /* Hide label in condensed header mode */
  }
}
</style>