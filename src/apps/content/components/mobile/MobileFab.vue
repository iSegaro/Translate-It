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

// Internal variables
let dragStartY = 0;
let initialFabY = 0;
let animationFrameId = null;
let fabIdleTimerId = null;
let instabilityTimer = null;

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  
  // Mark viewport as unstable (scrolling/resizing)
  isViewportUnstable.value = true;
  
  if (instabilityTimer) clearTimeout(instabilityTimer);
  instabilityTimer = tracker.trackTimeout(() => {
    isViewportUnstable.value = false;
    instabilityTimer = null;
  }, 250); // Reappear 250ms after scroll stops
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
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
    
    setTimeout(() => {
      isReady.value = true;
      setTimeout(() => {
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

  // SCROLL LOGIC: Hide when scrolling
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
    // Smooth transition for appearing/disappearing
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
  if (isMouseEvent) {
    window.addEventListener('mousemove', onFabDragMove);
    window.addEventListener('mouseup', onFabDragEnd);
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
  isFabDragging.value = false;
  window.removeEventListener('mousemove', onFabDragMove);
  window.removeEventListener('mouseup', onFabDragEnd);
  try {
    await storageManager.set({ MOBILE_FAB_POSITION: { side: side.value, y: fabPosition.value.y } });
  } catch (err) {}
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
  if (fabIdleTimerId) clearTimeout(fabIdleTimerId);
  isFabIdle.value = false;
  fabIdleTimerId = tracker.trackTimeout(() => {
    isFabIdle.value = true;
    fabIdleTimerId = null;
  }, 750);
};

onUnmounted(() => {
  window.removeEventListener('mousemove', onFabDragMove);
  window.removeEventListener('mouseup', onFabDragEnd);
  if (instabilityTimer) clearTimeout(instabilityTimer);
});
</script>

<style scoped>
.mobile-fab img { filter: brightness(0) invert(1) !important; }
</style>