<template>
  <div
    v-if="isVisible"
    ref="tooltipRef"
    class="page-translation-tooltip-shadow-safe"
    :style="tooltipFullStyle"
  >
    {{ text }}
  </div>
</template>

<script setup>
import { ref, nextTick, computed } from 'vue';
import { pageEventBus, PAGE_TRANSLATION_EVENTS } from '@/core/PageEventBus.js';
import { detectDirectionFromContent } from '@/utils/dom/DomDirectionManager.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';

const isVisible = ref(false);
const text = ref('');
const direction = ref('ltr');
const position = ref({ x: 0, y: 0 });
const tooltipRef = ref(null);

const settingsStore = useSettingsStore();
// Use the central resource tracker for safe memory management
const tracker = useResourceTracker('page-translation-tooltip');

/**
 * Unified Shadow DOM Robust Styling:
 * Combining all styles (visual + dynamic) into a single string with !important.
 * This is the ONLY 100% reliable way to ensure styling in a strict Shadow DOM
 * where external CSS injection might fail.
 */
const tooltipFullStyle = computed(() => {
  if (!isVisible.value) return 'display: none !important;';

  const isDark = settingsStore.isDarkTheme;
  const textAlign = direction.value === 'rtl' ? 'right' : 'left';
  
  // Design tokens based on current theme
  const bgColor = isDark ? '#222222' : '#ffffff';
  const textColor = isDark ? '#ffffff' : '#202124';
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.2)' : '#dadce0';
  const shadow = isDark ? '0 4px 15px rgba(0, 0, 0, 0.4)' : '0 2px 10px rgba(0, 0, 0, 0.1)';

  return `
    position: fixed !important;
    z-index: 2147483647 !important;
    top: 0 !important;
    left: 0 !important;
    padding: 8px 14px !important;
    background-color: ${bgColor} !important;
    color: ${textColor} !important;
    border: 1px solid ${borderColor} !important;
    border-radius: 6px !important;
    box-shadow: ${shadow} !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    font-size: 13px !important;
    line-height: 1.5 !important;
    max-width: 350px !important;
    word-wrap: break-word !important;
    white-space: pre-wrap !important;
    pointer-events: none !important;
    visibility: visible !important;
    opacity: 1 !important;
    display: block !important;
    text-align: ${textAlign} !important;
    direction: ${direction.value} !important;
    transform: translate3d(${position.value.x}px, ${position.value.y}px, 0) !important;
    will-change: transform !important;
  `;
});

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
