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
  height: calc(100vh - 40px);
  height: calc(100svh - 40px); 
  
  margin-bottom: 40px;
  overflow: hidden;
  
  /* Fix for Waydroid/Android Nav Bar overlap in all layouts */
  padding-bottom: env(safe-area-inset-bottom, 0px) !important;
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
  padding: $spacing-xl;
  padding-bottom: calc($spacing-xl + env(safe-area-inset-bottom, 0px)); /* Added safety padding for desktop layout in emulators */
  overflow-y: auto;
  overflow-x: hidden;
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
    width: 95vw;
    height: 90vh;
    margin-top: 20px;
  }
  
  .options-main {
    flex-direction: column;
    flex: 1;
    min-height: 0;
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
    padding-bottom: env(safe-area-inset-bottom, 20px) !important; /* Respect Android Nav Bar */
  }

  .options-main {
    flex: 1 !important;
    flex-direction: column !important;
    height: auto !important;
    min-height: 0 !important;
    border-radius: 0 !important;
  }

  .tab-content-container {
    padding: 0 !important;
    flex: 1 !important;
    overflow-y: auto !important;
    
    // Additional padding for the content itself
    :global(.tab-content) {
      padding-bottom: calc(140px + env(safe-area-inset-bottom, 0px)) !important;
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