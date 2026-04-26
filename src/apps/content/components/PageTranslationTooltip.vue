<template>
  <div
    v-if="isVisible"
    ref="tooltipRef"
    class="ti-page-translation-tooltip"
    :dir="direction"
    :style="{ '--tooltip-transform': `translate3d(${position.x}px, ${position.y}px, 0)` }"
  >
    {{ text }}
  </div>
</template>

<script setup>
import './PageTranslationTooltip.scss'
import { ref, nextTick } from 'vue';
import { pageEventBus, PAGE_TRANSLATION_EVENTS } from '@/core/PageEventBus.js';
import { detectDirectionFromContent } from '@/utils/dom/DomDirectionManager.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

const isVisible = ref(false);
const text = ref('');
const direction = ref('ltr');
const position = ref({ x: 0, y: 0 });
const tooltipRef = ref(null);

// Use the central resource tracker for safe memory management
const tracker = useResourceTracker('page-translation-tooltip');

const showTooltip = async (detail) => {
  if (!detail.text) return;
  
  text.value = detail.text;
  direction.value = detectDirectionFromContent(detail.text);
  isVisible.value = true;
  
  // Wait for the DOM to get dimensions before calculating position
  await nextTick();
  calculatePosition(detail.position);
};

const hideTooltip = () => {
  isVisible.value = false;
};

const calculatePosition = (pos) => {
  if (!pos || !isVisible.value || !tooltipRef.value) return;
  
  const el = tooltipRef.value;
  const rect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const offset = 15;
  let x = pos.x + offset;
  let y = pos.y - rect.height - offset;

  // Space logic
  if (y < 10) y = pos.y + offset + 20;
  if (y + rect.height > viewportHeight) y = viewportHeight - rect.height - 10;
  if (x + rect.width > viewportWidth) x = pos.x - rect.width - offset;
  if (x < 10) x = 10;

  position.value = { x, y };
};

const updatePosition = (pos) => {
  if (!isVisible.value) return;
  requestAnimationFrame(() => calculatePosition(pos));
};

// Safe event listening with automatic cleanup
tracker.addEventListener(pageEventBus, PAGE_TRANSLATION_EVENTS.SHOW_TOOLTIP, showTooltip);
tracker.addEventListener(pageEventBus, PAGE_TRANSLATION_EVENTS.HIDE_TOOLTIP, hideTooltip);
tracker.addEventListener(pageEventBus, PAGE_TRANSLATION_EVENTS.UPDATE_TOOLTIP_POSITION, updatePosition);
</script>
