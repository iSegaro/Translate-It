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
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.UI, 'OptionsLayout');
  }
  return _logger;
};


// RTL detection using i18n plugin
const isRTL = computed(() => {
  try {
    // Access browser API safely
    if (typeof browser !== 'undefined' && browser.i18n) {
      return browser.i18n.getMessage('IsRTL') === 'true'
    }
    return false
  } catch (e) {
    getLogger().debug('Failed to get RTL setting:', e.message)
    return false
  }
})</script>

<style lang="scss" scoped>
@use '@/assets/styles/variables.scss' as *;

.options-layout {
  display: flex;
  width: 100%;
  max-width: 1200px;
  height: 90vh;
  background-color: transparent;
  border-radius: $border-radius-lg;
  box-shadow: $shadow-lg;
  overflow: hidden;
  border: $border-width $border-style var(--color-border);
  
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