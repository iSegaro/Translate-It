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
        marginLeft: '0 !important',
        marginRight: 'auto !important',
        paddingLeft: '6px !important',
        transition: 'none'
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

const props = defineProps({
  isRtl: {
    type: Boolean,
    default: false
  }
});

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'MobileFab');
const { t } = useUnifiedI18n();
const mobileStore = useMobileStore();
const tracker = useResourceTracker('mobile-fab');

// State
const fabPosition = ref({ x: null, y: 120 });
const isFabDragging = ref(false);
const isFabIdle = ref(false);
const isHovering = ref(false);
const isViewportUnstable = ref(false);
let dragStartY = 0;
let initialFabY = 0;
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
  initialFabY = fabPosition.value.y || 120;
  
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
  
  if (e.cancelable) e.preventDefault();
  if (animationFrameId) return;

  animationFrameId = requestAnimationFrame(() => {
    const deltaY = dragStartY - currentY;
    let newY = initialFabY + deltaY;
    
    // Clamp to layout viewport
    newY = Math.max(50, Math.min(window.innerHeight - 50, newY));
    
    fabPosition.value = { ...fabPosition.value, y: newY };
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
  
  try {
    await storageManager.set({ 
      MOBILE_FAB_POSITION: { x: null, y: fabPosition.value.y } 
    });
  } catch (err) {
    logger.error('Failed to save mobile FAB position:', err);
  }
  
  startFabIdleTimer();
};

const handleSelectionChange = () => {
  const selection = window.getSelection();
  const selectedText = selection ? selection.toString().trim() : '';
  
  if (selectedText) {
    // Wake up FAB when text is selected (Fade in)
    startFabIdleTimer();
  }
};

const onMobileFabClick = () => {
  // 1. Try to get text already captured by WindowsManager state
  let selectedText = window.windowsManagerInstance?.state?.originalText || '';

  // 2. Fallback: Manual detection (useful if WindowsManager features are disabled in settings)
  if (!selectedText) {
    const selection = window.getSelection();
    selectedText = selection ? selection.toString().trim() : '';
  }

  if (selectedText) {
    // Delegate to WindowsManager if available to handle the full translation lifecycle
    if (window.windowsManagerInstance) {
      window.windowsManagerInstance._showMobileSheet(selectedText);
    } else {
      // Pure manual fallback
      mobileStore.updateSelectionData({ text: selectedText, isLoading: true, translation: '' });
      mobileStore.openSheet(MOBILE_CONSTANTS.VIEWS.SELECTION);
    }
  } else {
    let viewToOpen = mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    mobileStore.openSheet(viewToOpen);
  }
};

const fabStyle = computed(() => {
  const isRTL = props.isRtl;
  const y = fabPosition.value.y || 120;
  
  // Visibility Logic: 
  // 1. If dragging or hovering: Full visibility
  // 2. If scrolling/unstable: Completely hidden (0)
  // 3. If idle: Faint (0.2)
  // 4. Default: Active (1)
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
  
  return {
    position: 'fixed !important',
    bottom: `${y}px !important`,
    left: isRTL ? '0 !important' : '100% !important',
    marginLeft: '-25px !important',
    width: '50px !important',
    height: '50px !important',
    display: 'flex !important',
    zIndex: '2147483647 !important',
    pointerEvents: `${pointerEvents} !important`,
    '--fab-opacity-val': currentOpacity,
    opacity: 'var(--fab-opacity-val) !important',
    transition: isFabDragging.value ? 'none' : 'opacity 0.25s ease, bottom 0.1s ease-out'
  };
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
    const savedPosition = await getMobileFabPositionAsync();
    if (savedPosition && savedPosition.y !== null) {
      fabPosition.value.y = savedPosition.y;
    }
  } catch (err) {
    logger.error('Failed to load mobile FAB position:', err);
  }
  startFabIdleTimer();
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