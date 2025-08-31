<template>
  <Transition name="language-change" mode="out-in">
    <div class="options-layout" :key="currentLocale" :class="{ 'language-changing': isLanguageChanging }">
      <OptionsSidebar />
      <main class="options-main">
        <OptionsNavigation />
        <div class="tab-content-container">
          <router-view />
        </div>
      </main>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import OptionsSidebar from './OptionsSidebar.vue'
import OptionsNavigation from '@/components/layout/OptionsNavigation.vue'
import { useUnifiedI18n } from '@/composables/useUnifiedI18n.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.UI, 'OptionsLayout');

const { t, locale } = useUnifiedI18n()

// Animation state
const isLanguageChanging = ref(false)

// Animation control
const pendingLocaleChange = ref(null)
const displayLocale = ref(locale.value)

// Watch for language changes and control animation timing
watch(() => locale.value, async (newLocale, oldLocale) => {
  if (oldLocale && newLocale !== oldLocale) {
    logger.debug('🌍 Language change initiated from', oldLocale, 'to', newLocale)
    
    // Store the pending change
    pendingLocaleChange.value = newLocale
    isLanguageChanging.value = true
    
    // Start animation, then change language at midpoint (300ms), then finish animation
    setTimeout(() => {
      logger.debug('🎯 Applying language change mid-animation')
      displayLocale.value = pendingLocaleChange.value
    }, 300) // Change language at animation midpoint
    
    // Reset after animation completes
    setTimeout(() => {
      isLanguageChanging.value = false
      pendingLocaleChange.value = null
    }, 600) // Total animation duration
  }
})

// Use displayLocale instead of locale for the key
const currentLocale = computed(() => displayLocale.value)


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

/* Professional Language Change Animations with Perfect Timing */
.language-change-enter-active,
.language-change-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.language-change-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.92);
  filter: blur(3px);
}

.language-change-leave-to {
  opacity: 0;
  transform: translateY(-30px) scale(0.92);
  filter: blur(3px);
}

.language-change-enter-to,
.language-change-leave-from {
  opacity: 1;
  transform: translateY(0) scale(1);
  filter: blur(0);
}

/* Enhanced middle state for smoother language transition */
.language-change-enter-active {
  transition-delay: 0s;
}

.language-change-leave-active {
  transition-delay: 0s;
}

/* Main container animation during language change - applied to entire layout */
.options-layout.language-changing {
  position: relative;
  overflow: hidden;
  
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      45deg,
      transparent 30%,
      rgba(var(--color-primary-rgb, 59, 130, 246), 0.08) 50%,
      transparent 70%
    );
    transform: translateX(-100%);
    animation: shimmer 0.6s ease-out;
    pointer-events: none;
    z-index: 10;
    border-radius: $border-radius-lg;
  }
  
  /* Add subtle shadow and scale during transition */
  box-shadow: 
    $shadow-lg,
    0 0 30px rgba(var(--color-primary-rgb, 59, 130, 246), 0.1);
  transform: scale(1.002);
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

/* Additional smooth transitions for the entire layout */
.options-layout {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: center center;
}

/* Enhanced focus and interaction feedback */
:global(.options-layout.rtl) {
  .language-change-enter-from {
    transform: translateY(20px) scale(0.95) rotateY(5deg);
  }
  
  .language-change-leave-to {
    transform: translateY(-20px) scale(0.95) rotateY(-5deg);
  }
}
</style>