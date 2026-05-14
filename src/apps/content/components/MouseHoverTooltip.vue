<template>
  <div
    v-if="isVisible"
    ref="tooltipRef"
    class="ti-mouse-hover-tooltip"
    :dir="direction"
    :style="{ '--tooltip-transform': `translate3d(${position.x}px, ${position.y}px, 0)` }"
  >
    <div class="ti-mouse-hover-content">
      {{ translatedText }}
    </div>
  </div>
</template>

<script setup>
import './MouseHoverTooltip.scss'
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { pageEventBus } from '@/core/PageEventBus.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { settingsManager } from '@/shared/managers/SettingsManager.js';

const isVisible = ref(false);
const translatedText = ref('');
const direction = ref('ltr');
const position = ref({ x: 0, y: 0 });
const tooltipRef = ref(null);
let autoHideTimer = null;

const tracker = useResourceTracker('mouse-hover-tooltip');

const showTooltip = async (detail) => {
  if (!detail.translatedText) return;
  
  // Clear any existing timer
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }

  translatedText.value = detail.translatedText;
  direction.value = detail.direction || 'ltr';
  isVisible.value = true;
  
  await nextTick();
  calculatePosition(detail.position);

  // Setup auto-hide if configured for timer
  const autoClose = settingsManager.get('MOUSE_HOVER_AUTO_CLOSE', 'mouseleave');
  if (autoClose === 'timer') {
    const duration = settingsManager.get('MOUSE_HOVER_TIMER_DURATION', 3000);
    autoHideTimer = setTimeout(() => {
      hideTooltip();
    }, duration);
  }
};

const hideTooltip = () => {
  isVisible.value = false;
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
};

const calculatePosition = (pos) => {
  if (!pos || !isVisible.value || !tooltipRef.value) return;
  
  const el = tooltipRef.value;
  const rect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const offset = 15;
  let x = pos.x + offset;
  let y = pos.y + offset; // Show below the cursor to avoid overlapping text

  // Adjust if going off screen
  if (x + rect.width > viewportWidth) x = pos.x - rect.width - offset;
  if (x < 10) x = 10;
  
  if (y + rect.height > viewportHeight) y = pos.y - rect.height - offset;
  if (y < 10) y = 10;

  position.value = { x, y };
};

// Safe event listening with automatic cleanup
tracker.addEventListener(pageEventBus, 'MOUSE_HOVER_TRANSLATION_READY', showTooltip);
tracker.addEventListener(pageEventBus, 'MOUSE_HOVER_HIDE_TOOLTIP', hideTooltip);

onUnmounted(() => {
  if (autoHideTimer) clearTimeout(autoHideTimer);
});
</script>
