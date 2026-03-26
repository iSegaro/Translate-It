<template>
  <div 
    v-if="isReady"
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
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'MobileFab');
const { t } = useUnifiedI18n();
const mobileStore = useMobileStore();

/**
 * MEMORY MANAGEMENT: Use the centralized ResourceTracker
 * This handles automatic cleanup of:
 * - Event Listeners (DOM & Extension)
 * - Timers (Timeout/Interval)
 * - Animation Frames
 */
const tracker = useResourceTracker('mobile-fab');

// State
const isReady = ref(false);
const isPositioning = ref(true);
const fabPosition = ref({ x: null, y: null });
const isFabDragging = ref(false);
const isFabIdle = ref(true);
const isHovering = ref(false);
const isViewportUnstable = ref(false);
const side = ref(null); 

// Internal variables (Tracked via tracker)
let dragStartY = 0;
let initialFabY = 0;
let animationFrameId = null;
let instabilityTimer = null;
let fabIdleTimerId = null;

const handleSelectionChange = () => {
  if (typeof window === 'undefined') return;
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  
  if (selectedText) {
    // Wake up FAB when text is selected (Fade in)
    startFabIdleTimer();
  }
};

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  isViewportUnstable.value = true;
  
  if (instabilityTimer) {
    // TRACKER INTEGRATION: Clear and unregister from memory tracking
    tracker.clearTimer(instabilityTimer);
    instabilityTimer = null;
  }
  
  instabilityTimer = tracker.trackTimeout(() => {
    isViewportUnstable.value = false;
    instabilityTimer = null;
  }, 250);
};

onMounted(async () => {
  // Use tracker for window and document events
  if (typeof window !== 'undefined') {
    tracker.addEventListener(document, 'selectionchange', handleSelectionChange);
    tracker.addEventListener(window, 'scroll', updateViewport, { passive: true });
    tracker.addEventListener(window, 'resize', updateViewport);
  }

  try {
    const savedData = await storageManager.get('MOBILE_FAB_POSITION');
    const pos = savedData.MOBILE_FAB_POSITION;
    
    if (pos) {
      fabPosition.value.y = pos.y !== null ? pos.y : MOBILE_CONSTANTS.FAB.DEFAULT_Y;
      side.value = pos.side || MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    } else {
      fabPosition.value.y = MOBILE_CONSTANTS.FAB.DEFAULT_Y;
      side.value = MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    }
    
    // TRACKED TIMERS: Important for preventing memory leaks on fast unmounts
    tracker.trackTimeout(() => {
      isReady.value = true;
      tracker.trackTimeout(() => {
        isPositioning.value = false;
      }, 500);
    }, 150);
  } catch (err) {
    logger.error('Failed to load mobile FAB position:', err);
    fabPosition.value.y = MOBILE_CONSTANTS.FAB.DEFAULT_Y;
    side.value = MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    isReady.value = true;
  }
});

const fabStyle = computed(() => {
  if (!isReady.value || side.value === null || fabPosition.value.y === null) {
    return { display: 'none !important' };
  }
  
  const y = fabPosition.value.y;
  const currentSide = side.value;
  const x = fabPosition.value.x;
  
  let currentOpacity = '1';
  let pointerEvents = 'auto';

  if (isViewportUnstable.value && !isFabDragging.value) {
    currentOpacity = '0';
    pointerEvents = 'none';
  } else if (isFabIdle.value && !isFabDragging.value && !isHovering.value) {
    currentOpacity = '0.2';
  }
  
  const style = {
    position: 'fixed !important',
    bottom: `${y}px !important`,
    width: '50px !important',
    height: '50px !important',
    display: 'flex !important',
    alignItems: 'center !important',
    zIndex: '2147483647 !important',
    opacity: `${currentOpacity} !important`,
    pointerEvents: `${pointerEvents} !important`,
    borderRadius: '50% !important',
    cursor: 'pointer !important',
    willChange: 'opacity, bottom, left',
    transition: (isFabDragging.value || isPositioning.value) ? 'none !important' : 'opacity 0.2s ease, bottom 0.1s ease-out, left 0.3s ease-out, margin 0.3s ease-out'
  };

  if (isFabDragging.value && x !== null) {
    style.left = `${x}px !important`;
    style.marginLeft = '-20px !important';
    style.justifyContent = 'center !important';
  } else {
    if (currentSide === MOBILE_CONSTANTS.FAB.SIDE.LEFT) {
      style.left = '0 !important';
      style.marginLeft = '-35px !important';
      style.justifyContent = 'flex-end !important';
    } else {
      style.left = '100% !important';
      style.marginLeft = '-15px !important';
      style.justifyContent = 'flex-start !important';
    }
  }
  return style;
});

// Event Handlers
const onFabDragStart = (e) => {
  const isMouseEvent = e.type === 'mousedown';
  if (isMouseEvent && e.button !== 0) return;
  const point = isMouseEvent ? e : e.touches[0];
  
  isFabDragging.value = true;
  dragStartY = point.clientY;
  initialFabY = fabPosition.value.y;

  // DYNAMIC TRACKING: Use tracker even for temporary listeners
  if (isMouseEvent) {
    tracker.addEventListener(window, 'mousemove', onFabDragMove);
    tracker.addEventListener(window, 'mouseup', onFabDragEnd);
  }
  
  isFabIdle.value = false;
};

const onFabDragMove = (e) => {
  if (!isFabDragging.value) return;
  const isMouseEvent = e.type === 'mousemove';
  const point = isMouseEvent ? e : e.touches[0];
  const currentY = point.clientY;
  
  if (e.cancelable) e.preventDefault();
  
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(() => {
      const deltaY = dragStartY - currentY;
      fabPosition.value.y = Math.max(50, Math.min(window.innerHeight - 50, initialFabY + deltaY));
      
      const snapThreshold = window.innerWidth / 2;
      side.value = point.clientX < snapThreshold ? MOBILE_CONSTANTS.FAB.SIDE.LEFT : MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
      animationFrameId = null;
    });
  }
};

const onFabDragEnd = async (e) => {
  if (!isFabDragging.value) return;
  isFabDragging.value = false;
  
  // DYNAMIC CLEANUP: Respect tracker by using removeEventListener
  const isMouseEvent = e && e.type === 'mouseup';
  if (isMouseEvent) {
    tracker.removeEventListener(window, 'mousemove', onFabDragMove);
    tracker.removeEventListener(window, 'mouseup', onFabDragEnd);
  }

  try {
    await storageManager.set({ 
      MOBILE_FAB_POSITION: { side: side.value, y: fabPosition.value.y } 
    });
  } catch (err) {
    logger.error('Failed to save mobile FAB position:', err);
  }
  
  startFabIdleTimer();
};

const onMobileFabClick = () => {
  let text = window.windowsManagerInstance?.state?.originalText || window.getSelection()?.toString().trim() || '';
  if (text) window.windowsManagerInstance?._showMobileSheet(text);
  else mobileStore.openSheet(mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD);
};

const onMouseEnter = () => { isHovering.value = true; isFabIdle.value = false; };
const onMouseLeave = () => { isHovering.value = false; startFabIdleTimer(); };

const startFabIdleTimer = () => {
  if (isHovering.value || isFabDragging.value) return;
  if (fabIdleTimerId) tracker.clearTimer(fabIdleTimerId);
  
  isFabIdle.value = false;
  fabIdleTimerId = tracker.trackTimeout(() => {
    isFabIdle.value = true;
    fabIdleTimerId = null;
  }, 750);
};

onUnmounted(() => {
  // NO MANUAL CLEANUP NEEDED: useResourceTracker handles window events and timers.
  // We only cancel the Animation Frame as it's a specific non-timer resource.
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
</script>

<style scoped>
.mobile-fab img { filter: brightness(0) invert(1) !important; }
</style>