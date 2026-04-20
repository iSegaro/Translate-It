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
