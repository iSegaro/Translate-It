<template>
  <div class="options-layout">
    <OptionsSidebar />
    <main class="options-main">
      <OptionsNavigation />
      <div class="tab-content-container">
        <router-view />
      </div>
    </main>
  </div>
</template>

<script setup>
import './OptionsLayout.scss'
import { useRoute } from 'vue-router'
import { watch, onMounted } from 'vue'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { createLanguageTransition, createThemeTransition } from '@/composables/ui/useUITransition.js'
import { useHighlightManager } from './composables/useHighlightManager.js'
import OptionsSidebar from './OptionsSidebar.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

// Logger
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsLayout')

// Stores & Composables
const { locale } = useUnifiedI18n()
const settingsStore = useSettingsStore()
const route = useRoute()
const { checkAndHighlight } = useHighlightManager()

// --- Highlighting Logic ---
// Automatically check for highlight parameters on mount and route changes
onMounted(() => {
  checkAndHighlight()
})

watch(() => route.fullPath, () => {
  checkAndHighlight()
}, { deep: true })

// --- UI Transitions ---

// Language transition animation
createLanguageTransition(() => locale.value, {
  containerSelector: '.options-layout',
  onTransitionStart: (newLocale) => {
    logger.debug('Language transition started:', newLocale)
  },
  onTransitionMid: (newLocale) => {
    logger.debug('Language transition mid-point:', newLocale)
  },
  onTransitionEnd: (newLocale) => {
    logger.debug('Language transition completed:', newLocale)
  }
})

// Theme transition animation
createThemeTransition(() => settingsStore.settings?.THEME, {
  containerSelector: '.options-layout',
  onTransitionStart: (newTheme) => {
    logger.debug('Theme transition started:', newTheme)
  },
  onTransitionMid: (newTheme) => {
    logger.debug('Theme transition mid-point:', newTheme)
  },
  onTransitionEnd: (newTheme) => {
    logger.debug('Theme transition completed:', newTheme)
  }
})
</script>
