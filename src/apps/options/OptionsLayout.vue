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
import OptionsSidebar from "./OptionsSidebar.vue";
import OptionsNavigation from "@/components/layout/OptionsNavigation.vue";
import { useUnifiedI18n } from "@/composables/shared/useUnifiedI18n.js";
import {
  createLanguageTransition,
  createThemeTransition,
} from "@/composables/ui/useUITransition.js";
import { useSettingsStore } from "@/features/settings/stores/settings.js";
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
const logger = getScopedLogger(LOG_COMPONENTS.UI, "OptionsLayout");

const { locale } = useUnifiedI18n();
const settingsStore = useSettingsStore();

// Language transition animation
createLanguageTransition(() => locale.value, {
  containerSelector: ".options-layout",
  onTransitionStart: (newLocale) => {
    logger.debug("Language transition started:", newLocale);
  },
  onTransitionMid: (newLocale) => {
    logger.debug("Language transition mid-point:", newLocale);
  },
  onTransitionEnd: (newLocale) => {
    logger.debug("Language transition completed:", newLocale);
  },
});

// Theme transition animation
createThemeTransition(() => settingsStore.settings?.THEME, {
  containerSelector: ".options-layout",
  onTransitionStart: (newTheme) => {
    logger.debug("Theme transition started:", newTheme);
  },
  onTransitionMid: (newTheme) => {
    logger.debug("Theme transition mid-point:", newTheme);
  },
  onTransitionEnd: (newTheme) => {
    logger.debug("Theme transition completed:", newTheme);
  },
});
</script>

<style lang="scss">
@use "@/assets/styles/base/variables" as *;
@use "@/assets/styles/components/ui-transitions" as *;

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
  
  /* Robust height for both desktop and mobile/emulators */
  height: calc(100vh - 20px);
  height: calc(100svh - 20px); 
  
  overflow: hidden;
}

/* RTL layout adjustments */
:global(.extension-options.rtl) .options-layout {
  flex-direction: row-reverse;
}

.options-main {
  flex: 1;
  display: flex;
  background-color: var(--color-background);
  border-radius: 0 $border-radius-lg $border-radius-lg 0;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.tab-content-container {
  flex: 1;
  padding: $spacing-sm $spacing-xl $spacing-xl; /* Increased top padding to 10px (spacing-sm) */
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable; // Prevent layout shift when scrollbar appears
  position: relative;
  scroll-behavior: smooth;
  box-sizing: border-box;
  max-width: 100%;

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
    &:hover { background-color: var(--color-text-secondary); }
  }

  // Ensure all child content respects container width
  > * {
    max-width: 100%;
    box-sizing: border-box;
    overflow-wrap: break-word;
  }

  // Global styles for all tab content
  :global(.tab-content) {
    max-width: 100%;
    box-sizing: border-box;
    padding-bottom: 20px; /* Default desktop padding */

    * {
      max-width: 100%;
      box-sizing: border-box;
    }
  }
}

// Tablet responsive
@media (max-width: #{$breakpoint-lg}) {
  .options-layout {
    flex-direction: column !important; /* Force stack layout for sidebar header */
    width: 100%;
    height: 100vh;
    height: 100svh;
    margin: 0;
    border-radius: 0;
    border: none;
  }
  
  .options-main {
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden; 
  }

  .tab-content-container {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: $spacing-md;
    
    :global(.tab-content) {
      padding-bottom: 80px; /* Space for sticky nav/header if needed */
    }
  }
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .options-layout {
    flex-direction: column !important;
    height: 100vh !important;
    height: 100svh !important; /* Use Small Viewport Height for mobile browsers */
    width: 100vw !important;
    margin: 0 !important;
    border-radius: 0 !important;
    border: none !important;
    max-width: none !important;
    min-width: 0 !important;
    padding-bottom: env(safe-area-inset-bottom, 0px) !important; /* Respect Android Nav Bar */
  }

  .options-main {
    flex: 1 !important;
    flex-direction: column !important;
    height: auto !important;
    min-height: 0 !important;
    border-radius: 0 !important;
    overflow: hidden; /* Prevent body scroll, use container scroll */
  }

  .tab-content-container {
    padding: $spacing-md !important;
    flex: 1 !important;
    overflow-y: auto !important;
    min-height: 0;
    
    // Additional padding for the content itself
    :global(.tab-content) {
      padding-bottom: calc(100px + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
}

// Small mobile responsive
@media (max-width: #{$breakpoint-sm}) {
  .tab-content-container {
    padding: $spacing-base $spacing-sm !important;
  }
}
</style>