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
import OptionsSidebar from './OptionsSidebar.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { createLanguageTransition, createThemeTransition } from '@/composables/ui/useUITransition.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsLayout');

const { locale } = useUnifiedI18n()
const settingsStore = useSettingsStore()

// Language transition animation
createLanguageTransition(
  () => locale.value,
  {
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
  }
)

// Theme transition animation
createThemeTransition(
  () => settingsStore.settings?.THEME,
  {
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
  }
)

</script>

<style lang="scss">
@use "@/assets/styles/base/variables" as *;
@use "@/assets/styles/components/ui-transitions" as *;</style>

<style lang="scss" scoped>
@use "@/assets/styles/base/variables" as *;

.options-layout {
  display: flex;
  width: min(1200px, calc(100vw - 40px));
  max-width: 1200px;
  min-width: 320px;
  background-color: var(--color-background);
  border-radius: $border-radius-lg;
  box-shadow: $shadow-lg;
  border: $border-width $border-style var(--color-border);
  margin: 0 auto;
  box-sizing: border-box;
  height: calc(100vh - 40px) !important; /* Force height to leave space at the bottom */
  margin-bottom: 40px !important; /* Force spacing at the bottom */
  
  /* Debug outline removed */
}

.options-main {
  flex: 1;
  display: flex;
  background-color: var(--color-background);
  border-radius: 0 $border-radius-lg $border-radius-lg 0;
  min-width: 0;
  width: 900px; // 200px navigation + 700px content
  max-width: 900px;
  box-sizing: border-box;
}

.tab-content-container {
  flex: 1;
  width: 700px;
  // min-width: 700px;
  max-width: 700px;
  padding: $spacing-xl;
  overflow-y: auto;
  position: relative;
  scroll-behavior: smooth;
  box-sizing: border-box;
  
  // Better scrollbar styling
  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }
  
  &::-webkit-scrollbar-track {
    background-color: var(--color-surface);
    border-radius: 4px;
  }
  
  &::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 4px;
    
    &:hover {
      background-color: var(--color-text-secondary);
    }
  }
  
  &::-webkit-scrollbar-corner {
    background-color: var(--color-surface);
  }
  
  // Ensure all child content respects container width
  > * {
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }
  
  // Global styles for all tab content
  :global(.tab-content) {
    max-width: 100%;
    box-sizing: border-box;
    
    // Ensure all form elements and content respect container width
    * {
      max-width: 100%;
      box-sizing: border-box;
    }
    
    // Specific handling for wide elements
    table, pre, code {
      overflow-x: auto;
    }
    
    // Handle long text content
    p, div, span {
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
  }
}

// Tablet responsive
@media (max-width: #{$breakpoint-lg}) {
  .options-layout {
    width: 95vw;
    height: auto;
    min-height: 90vh;
  }
  
  .options-main {
    width: auto;
    max-width: none;
  }
  
  .tab-content-container {
    width: auto;
    min-width: 300px;
    max-width: none;
    padding: $spacing-lg;
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .options-layout {
    flex-direction: column;
    height: auto;
    width: 98vw;
    min-height: 95vh;
  }
  
  .options-main {
    flex-direction: column;
    width: 100%;
    max-width: none;
  }
  
  .tab-content-container {
    width: 100%;
    min-width: auto;
    max-width: none;
    padding: $spacing-md;
  }
}

// Small mobile responsive
@media (max-width: #{$breakpoint-sm}) {
  .options-layout {
    border-radius: 0;
    min-height: 100vh;
    width: 100vw;
  }
  
  .tab-content-container {
    padding: $spacing-base;
  }
}

/* Tab content transition styles */
.tab-content {
  opacity: 0;
  display: none;
  transition: opacity 300ms ease;

  &.active {
    display: block;
    opacity: 1;
  }
}
</style>

<style scoped>
.options-layout {
  height: 100vh; /* ارتفاع کاملاً ثابت */
  max-height: 100vh; /* جلوگیری از افزایش ارتفاع */
  overflow: hidden; /* جلوگیری از اسکرول داخلی */
}

.tab-content-container {
  flex: 1; /* Allow the container to grow and fill available space */
  height: calc(100% - var(--options-main-padding, 20px)); /* Dynamically adjust based on options-main height */
  max-height: calc(100% - var(--options-main-padding, 20px)); /* Ensure it fits within options-main */
  overflow-y: auto; /* Enable vertical scrolling */
  overflow-x: hidden; /* Prevent horizontal scrolling */
}
</style>