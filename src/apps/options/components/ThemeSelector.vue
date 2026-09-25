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
import './ThemeSelector.scss'
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

// Latest-wins theme persistence: every click applies locally at once and records
// the latest pending theme; a single worker persists pending themes one at a time.
// updateSettingLocally() only touches Pinia state (no storage); the worker is the
// sole THEME persistence path. A capture always equals the live state at capture
// time (clicks set both together, synchronously), and the persist call runs before
// any other task can interleave — so updateSettingAndPersist's synchronous
// re-application is always a no-op and can never overwrite newer local state.
let pendingTheme = null
let themeWorkerRunning = false

const runThemeWorker = async () => {
  try {
    while (pendingTheme !== null) {
      const captured = pendingTheme
      pendingTheme = null
      try {
        await settingsStore.updateSettingAndPersist('THEME', captured)
      } catch (error) {
        logger.warn('Failed to persist theme change:', error)
      }
      // Broadcast only the still-latest selection after its own persistence
      // settles; a newer click during flight suppresses this stale broadcast
      // and the loop persists/broadcasts the newer theme instead.
      if (pendingTheme === null && settingsStore.settings.THEME === captured) {
        broadcastThemeChange(captured)
      }
    }
  } finally {
    themeWorkerRunning = false
  }
}

const persistPendingTheme = () => {
  if (themeWorkerRunning) return
  themeWorkerRunning = true
  runThemeWorker()
}

const setTheme = (theme) => {
  // Immediate local state so every click computes from the latest selection,
  // even while an earlier persistence is still in flight. No rollback on
  // persistence failure: local state always reflects the user's last click.
  settingsStore.updateSettingLocally('THEME', theme)
  pendingTheme = theme
  persistPendingTheme()
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
