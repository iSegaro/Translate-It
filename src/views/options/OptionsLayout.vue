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