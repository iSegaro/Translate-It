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
import { computed } from 'vue'
import OptionsSidebar from './OptionsSidebar.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsLayout');

const { t } = useUnifiedI18n()


// RTL detection using unified i18n (reactive to language changes)
const isRTL = computed(() => {
  try {
    const rtlValue = t('IsRTL') || 'false'
    return rtlValue === 'true'
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
  
  :global(.extension-options.rtl) & {
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
    
    // Global RTL styles for all tab content
    .tab-content-container {
      // Headers and titles
      h1, h2, h3, h4, h5, h6 {
        text-align: right;
      }
      
      // Setting groups
      .setting-group {
        label {
          text-align: right;
        }
        
        .setting-description {
          text-align: right;
        }
      }
      
      // Sub setting groups  
      .sub-setting-group {
        margin-right: $spacing-lg;
        margin-left: 0;
        padding-right: $spacing-md;
        padding-left: 0;
        border-right: 2px solid var(--color-border);
        border-left: none;
      }
      
      // Error messages
      .validation-error,
      .error-message {
        text-align: right;
      }
      
      // Form controls alignment
      .form-control,
      .form-group {
        text-align: right;
      }
      
      // Fieldset titles
      fieldset legend {
        text-align: right;
      }
      
      // Help tab specific RTL styles
      .help-tab {
        .accordion-header {
          text-align: right;
          
          .accordion-icon {
            margin-left: 0;
            margin-right: $spacing-sm;
          }
        }
        
        .accordion-inner {
          text-align: right;
          direction: rtl;
          
          ol, ul {
            padding-right: $spacing-lg;
            padding-left: 0;
          }
          
          li {
            text-align: right;
          }
          
          p {
            text-align: right;
          }
        }
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