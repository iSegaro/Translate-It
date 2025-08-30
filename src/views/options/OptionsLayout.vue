<template>
  <div
    class="options-layout"
    :class="{ 'rtl': isRTL }"
  >
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
import { computed } from 'vue'
import OptionsSidebar from './OptionsSidebar.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import browser from 'webextension-polyfill'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsLayout');


// RTL detection using i18n plugin
const isRTL = computed(() => {
  try {
    // Access browser API safely
    if (typeof browser !== 'undefined' && browser.i18n) {
      return browser.i18n.getMessage('IsRTL') === 'true'
    }
    return false
  } catch (e) {
  logger.debug('Failed to get RTL setting:', e.message)
    return false
  }
})
</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.options-layout {
  display: flex !important;
  width: 1200px !important;
  max-width: 1200px !important;
  min-width: 1200px !important;
  min-height: 90vh !important;
  background-color: transparent !important;
  border-radius: $border-radius-lg !important;
  box-shadow: $shadow-lg !important;
  overflow: hidden !important;
  border: $border-width $border-style var(--color-border) !important;
  
  /* Debug outline removed */
  
  &.rtl {
    direction: rtl;
    
    .options-sidebar {
      border-left: $border-width $border-style var(--color-border);
      border-right: none;
    }
    
    .options-main {
      .vertical-tabs {
        border-left: $border-width $border-style var(--color-border);
        border-right: none;
      }
    }
  }
}

.options-main {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--color-background);
}

.tab-content-container {
  flex: 1;
  padding: $spacing-xl;
  overflow-y: auto;
  position: relative;
}

// Mobile responsive
@media (max-width: #{$breakpoint-md}) {
  .options-layout {
    flex-direction: column;
    height: auto;
    
    .options-sidebar {
      flex: none;
      border-right: none;
      border-bottom: $border-width $border-style var(--color-border);
    }
    
    .options-main {
      flex-direction: column;
      
      .vertical-tabs {
        border-right: none;
        border-bottom: $border-width $border-style var(--color-border);
      }
    }
  }
  
  .tab-content-container {
    padding: $spacing-base;
  }
}
</style>