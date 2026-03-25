<template>
  <div 
    class="mobile-fab notranslate"
    :class="{ 'is-idle': isFabIdle && !isFabDragging && !isHovering }"
    translate="no"
    :style="fabStyle"
    @click="onMobileFabClick"
    @mousedown="onFabDragStart"
    @touchstart="onFabDragStart"
    @touchmove="onFabDragMove"
    @touchend="onFabDragEnd"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
    :title="t('mobile_fab_alt') || 'Translate'"
  >
    <img 
      src="@/icons/extension/extension_icon_64.svg" 
      :alt="t('mobile_fab_alt') || 'Translate'" 
      :style="{
        width: '26px !important',
        height: '26px !important',
        objectFit: 'contain',
        transform: side === 'left' ? 'scaleX(-1) !important' : 'none !important',
        transition: 'transform 0.3s ease'
      }"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMobileStore } from '@/store/modules/mobile.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getMobileFabPositionAsync } from '@/shared/config/config.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const props = defineProps({});

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'MobileFab');
const { t } = useUnifiedI18n();
const mobileStore = useMobileStore();
const tracker = useResourceTracker('mobile-fab');

// State
const fabPosition = ref({ x: null, y: 120 });
const isFabDragging = ref(false);
const isFabIdle = ref(true);
const isHovering = ref(false);
const isViewportUnstable = ref(true);
const side = ref('right'); // 'left' or 'right'
let dragStartY = 0;
let dragStartX = 0;
let initialFabY = 0;
let initialFabX = 0;
let fabIdleTimerId = null;
let animationFrameId = null;

let keyboardDebounceTimer = null;
let instabilityTimer = null;

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  
  // 1. Instability Tracking (Hide during scroll/resize)
  isViewportUnstable.value = true;
  if (instabilityTimer) clearTimeout(instabilityTimer);
  instabilityTimer = tracker.trackTimeout(() => {
    isViewportUnstable.value = false;
    instabilityTimer = null;
  }, 300);

  // 2. Keyboard Detection
  if (window.visualViewport) {
    const vv = window.visualViewport;
    if (keyboardDebounceTimer) clearTimeout(keyboardDebounceTimer);
    
    keyboardDebounceTimer = tracker.trackTimeout(() => {
      const threshold = 160; 
      const keyboardVisible = (window.innerHeight - vv.height) > threshold;
      
      if (mobileStore.isKeyboardVisible !== keyboardVisible) {
        mobileStore.setKeyboardVisibility(keyboardVisible);
        logger.debug(`Keyboard visibility changed: ${keyboardVisible}`);
      }
      keyboardDebounceTimer = null;
    }, 150);
  }
};

const startFabIdleTimer = () => {
  if (isHovering.value || isFabDragging.value) return;
  if (fabIdleTimerId) clearTimeout(fabIdleTimerId);
  
  isFabIdle.value = false;
  fabIdleTimerId = tracker.trackTimeout(() => {
    isFabIdle.value = true;
    fabIdleTimerId = null;
  }, 750);
};

const handleSelectionChange = () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  
  if (selectedText) {
    // Wake up FAB when text is selected (Fade in)
    startFabIdleTimer();
  }
};

const onMouseEnter = () => {
  isHovering.value = true;
  isFabIdle.value = false;
  if (fabIdleTimerId) {
    clearTimeout(fabIdleTimerId);
    fabIdleTimerId = null;
  }
};

const onMouseLeave = () => {
  isHovering.value = false;
  if (!isFabDragging.value) startFabIdleTimer();
};

const onFabDragStart = (e) => {
  const isMouseEvent = e.type === 'mousedown';
  if (isMouseEvent && e.button !== 0) return;
  
  const point = isMouseEvent ? e : e.touches[0];
  isFabDragging.value = true;
  dragStartY = point.clientY;
  dragStartX = point.clientX;
  initialFabY = fabPosition.value.y || 120;
  
  // Center of the FAB for drag calculations
  const screenWidth = window.innerWidth;
  initialFabX = side.value === 'right' ? screenWidth - 25 : 25;
  
  if (isMouseEvent) {
    window.addEventListener('mousemove', onFabDragMove);
    window.addEventListener('mouseup', onFabDragEnd);
  }
  
  isFabIdle.value = false;
  if (fabIdleTimerId) {
    clearTimeout(fabIdleTimerId);
    fabIdleTimerId = null;
  }
};

const onFabDragMove = (e) => {
  if (!isFabDragging.value) return;
  
  const isMouseEvent = e.type === 'mousemove';
  const point = isMouseEvent ? e : e.touches[0];
  const currentY = point.clientY;
  const currentX = point.clientX;
  
  if (e.cancelable) e.preventDefault();
  if (animationFrameId) return;

  animationFrameId = requestAnimationFrame(() => {
    // 1. Vertical Movement (Always allowed)
    const deltaY = dragStartY - currentY;
    let newY = initialFabY + deltaY;
    newY = Math.max(50, Math.min(window.innerHeight - 50, newY));
    
    // 2. Horizontal Magnetic Logic
    const screenWidth = window.innerWidth;
    const snapThreshold = screenWidth / 2; // Snap as soon as it crosses the midpoint
    const breakThreshold = 40; // Horizontal pull needed to detach from current side
    
    let newX = null;
    let newSide = side.value;

    const deltaXFromStart = Math.abs(currentX - dragStartX);

    if (deltaXFromStart > breakThreshold) {
      // User is deliberately pulling the FAB away from the edge
      if (currentX < snapThreshold) {
        // Snap/Stay on Left
        newSide = 'left';
        newX = null; 
      } else {
        // Snap/Stay on Right
        newSide = 'right';
        newX = null;
      }
    } else {
      // Stay pinned to the current side (Vertical movement only)
      newX = null;
    }
    
    fabPosition.value = { x: newX, y: newY };
    side.value = newSide;
    animationFrameId = null;
  });
};

const onFabDragEnd = async (e) => {
  if (!isFabDragging.value) return;
  isFabDragging.value = false;

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  const isMouseEvent = e && e.type === 'mouseup';
  if (isMouseEvent) {
    window.removeEventListener('mousemove', onFabDragMove);
    window.removeEventListener('mouseup', onFabDragEnd);
  }

  // Final snap on release based on center line
  if (fabPosition.value.x !== null) {
    const screenWidth = window.innerWidth;
    side.value = fabPosition.value.x < screenWidth / 2 ? 'left' : 'right';
  }

  // Ensure it's docked
  fabPosition.value.x = null;
  
  try {
    await storageManager.set({ 
      MOBILE_FAB_POSITION: { 
        side: side.value,
        y: fabPosition.value.y 
      } 
    });
  } catch (err) {
    logger.error('Failed to save mobile FAB position:', err);
  }
  
  startFabIdleTimer();
};

const onMobileFabClick = () => {
  // 1. Get selected text (prefer captured, fallback to manual)
  let selectedText = window.windowsManagerInstance?.state?.originalText || '';
  if (!selectedText) {
    selectedText = window.getSelection()?.toString().trim() || '';
  }

  if (selectedText && window.windowsManagerInstance) {
    // 2. Delegate to WindowsManager which handles the full translation & UI lifecycle
    window.windowsManagerInstance._showMobileSheet(selectedText);
  } else {
    // 3. Fallback: Open dashboard/active view
    let viewToOpen = mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    mobileStore.openSheet(viewToOpen);
  }
};

const fabStyle = computed(() => {
  const y = fabPosition.value.y || 120;
  const x = fabPosition.value.x;
  const currentSide = side.value;
  
  let currentOpacity = '1';
  let pointerEvents = 'auto';

  if (isFabDragging.value || isHovering.value) {
    currentOpacity = '1';
    pointerEvents = 'auto';
  } else if (isViewportUnstable.value) {
    currentOpacity = '0';
    pointerEvents = 'none';
  } else if (isFabIdle.value) {
    currentOpacity = '0.2';
    pointerEvents = 'auto';
  }
  
  const style = {
    position: 'fixed !important',
    bottom: `${y}px !important`,
    width: '50px !important',
    height: '50px !important',
    display: 'flex !important',
    alignItems: 'center !important',
    zIndex: '2147483647 !important',
    pointerEvents: `${pointerEvents} !important`,
    '--fab-opacity-val': currentOpacity,
    opacity: 'var(--fab-opacity-val) !important',
    transition: isFabDragging.value ? 'none' : 'opacity 0.25s ease, bottom 0.1s ease-out, left 0.3s ease-out, margin 0.3s ease-out'
  };

  if (isFabDragging.value && x !== null) {
    // During horizontal drag (Floating)
    style.left = `${x}px !important`;
    style.marginLeft = '-25px !important';
    style.justifyContent = 'center !important';
  } else {
    // Snapped/Docked state - PEEK MODE (Half outside)
    if (currentSide === 'left') {
      style.left = '0 !important';
      style.marginLeft = '-25px !important'; // 25px hidden, 25px visible
      style.justifyContent = 'flex-end !important'; // Push icon to the visible right half
    } else {
      style.left = '100% !important';
      style.marginLeft = '-25px !important'; // 25px hidden, 25px visible
      style.justifyContent = 'flex-start !important'; // Push icon to the visible left half
    }
  }

  return style;
  });
onMounted(async () => {
  if (typeof window !== 'undefined') {
    // Listen for text selection changes to wake up FAB
    tracker.addEventListener(document, 'selectionchange', handleSelectionChange);

    if (window.visualViewport) {
      tracker.addEventListener(window.visualViewport, 'resize', updateViewport);
      tracker.addEventListener(window.visualViewport, 'scroll', updateViewport);
    }
    tracker.addEventListener(window, 'resize', updateViewport);
    tracker.addEventListener(window, 'scroll', updateViewport, { passive: true });
  }
  
  updateViewport();

  try {
    const savedData = await storageManager.get('MOBILE_FAB_POSITION');
    const pos = savedData.MOBILE_FAB_POSITION;
    if (pos) {
      if (pos.y !== null) fabPosition.value.y = pos.y;
      if (pos.side) side.value = pos.side;
    }
  } catch (err) {
    logger.error('Failed to load mobile FAB position:', err);
  }
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onFabDragMove);
  window.removeEventListener('mouseup', onFabDragEnd);
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (keyboardDebounceTimer) clearTimeout(keyboardDebounceTimer);
  if (instabilityTimer) clearTimeout(instabilityTimer);
});
</script>

<style scoped>
.mobile-fab {
  background: #339af0 !important;
  border-radius: 50% !important;
  align-items: center !important;
  justify-content: flex-start !important;
  box-shadow: 0 4px 16px rgba(51, 154, 240, 0.4) !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
  cursor: pointer;
  will-change: opacity, bottom;
}

.mobile-fab:hover,
.mobile-fab:active {
  --fab-opacity-val: 1 !important;
}

.mobile-fab img {
  filter: brightness(0) invert(1) !important;
  transition: none !important;
}
</style>