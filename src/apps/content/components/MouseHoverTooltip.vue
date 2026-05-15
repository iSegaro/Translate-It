<template>
  <div
    v-if="isVisible"
    ref="tooltipRef"
    class="ti-mouse-hover-tooltip"
    :style="{ '--tooltip-transform': `translate3d(${position.x}px, ${position.y}px, 0)` }"
  >
    <TranslationDisplay
      :content="translatedText"
      :target-language="targetLanguage"
      mode="popup"
      :show-toolbar="false"
      max-height="40vh"
      class="ti-mouse-hover-display"
    />
  </div>
</template>

<script setup>
import './MouseHoverTooltip.scss'
import { ref, nextTick, onUnmounted } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import TranslationDisplay from '@/components/shared/TranslationDisplay.vue';

const logger = getScopedLogger(LOG_COMPONENTS.ON_HOVER, 'MouseHoverTooltip');
const isVisible = ref(false);
const translatedText = ref('');
const targetLanguage = ref('en');
const position = ref({ x: 0, y: 0 });
const tooltipRef = ref(null);
const isError = ref(false);

const tracker = useResourceTracker('mouse-hover-tooltip');

const showTooltip = async (detail) => {
  if (!detail.translatedText) return;
  
  // Clear any existing timer
  tracker.clearAllTimers();

  // CRITICAL: Hide first to reset dimensions and prevent ghosting from previous position
  isVisible.value = false;
  isError.value = false;
  translatedText.value = detail.translatedText;
  
  // Get target language for correct font and direction rendering
  targetLanguage.value = settingsManager.get('TARGET_LANGUAGE', 'fa');
  
  // Wait for content update and DOM reset
  await nextTick();
  isVisible.value = true;
  
  // Wait for new dimensions to be calculated by the browser
  await nextTick();
  calculatePosition(detail.position);

  // Setup auto-hide if configured for timer
  const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
  if (autoClose === 'timer') {
    const duration = settingsManager.get('MOUSE_HOVER_TIMER_DURATION', 3000);
    tracker.setTimeout(() => {
      hideTooltip();
    }, duration);
  }
};

const showError = (detail) => {
  isVisible.value = true;
  isError.value = true;
  translatedText.value = detail.error?.message || 'Translation failed';
  
  tracker.clearAllTimers();
  tracker.setTimeout(() => {
    hideTooltip();
  }, 3000);
};

const hideTooltip = () => {
  isVisible.value = false;
  isError.value = false;
  
  // Notify manager that tooltip is hidden so it can reset its cache
  pageEventBus.emit('MOUSE_HOVER_TOOLTIP_HIDDEN');
  
  tracker.clearAllTimers();
};

const calculatePosition = (pos) => {
  if (!pos || !isVisible.value || !tooltipRef.value) return;
  
  const el = tooltipRef.value;
  const rect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const offset = 15;
  let x = pos.x + offset;
  let y = pos.y - rect.height - offset; // Default: show ABOVE the cursor

  // Adjust Y position if it goes off the top of the screen
  if (y < 10) {
    // Not enough space above, show BELOW the cursor instead
    y = pos.y + offset;
    logger.debug('Not enough space above cursor, flipping tooltip to bottom');
  }

  // Adjust X position if it goes off the right edge
  if (x + rect.width > viewportWidth - 10) {
    x = pos.x - rect.width - offset;
  }
  
  // Final safety checks for viewport boundaries
  if (x < 10) x = 10;
  if (y + rect.height > viewportHeight - 10) y = viewportHeight - rect.height - 10;

  position.value = { x, y };
};

// Expose for testing
defineExpose({
  isVisible,
  translatedText,
  position,
  showTooltip,
  hideTooltip,
  calculatePosition
});

// Safe event listening with automatic cleanup
tracker.addEventListener(pageEventBus, 'MOUSE_HOVER_TRANSLATION_READY', showTooltip);
tracker.addEventListener(pageEventBus, 'MOUSE_HOVER_TRANSLATION_ERROR', showError);
tracker.addEventListener(pageEventBus, 'MOUSE_HOVER_HIDE_TOOLTIP', hideTooltip);
</script>
