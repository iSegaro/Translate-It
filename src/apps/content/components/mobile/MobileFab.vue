<template>
  <!-- Visual Viewport Resize Mask: Clips the FAB to the visible area and provides a relative coordinate system -->
  <div class="mobile-fab-viewport-mask notranslate" :style="maskStyle" translate="no">
    <div 
      class="mobile-fab"
      :class="{ 'is-idle': isFabIdle && !isFabDragging && !isHovering }"
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

// Viewport State for Resize Masking
const viewport = ref({
  width: typeof window !== 'undefined' ? window.innerWidth : 0,
  height: typeof window !== 'undefined' ? window.innerHeight : 0,
  offsetLeft: 0,
  offsetTop: 0
});

// FAB State
const fabPosition = ref({ x: null, y: 120 });
const isFabDragging = ref(false);
const isFabIdle = ref(false);
const isHovering = ref(false);
let dragStartY = 0;
let initialFabY = 0;
let fabIdleTimerId = null;
let animationFrameId = null;

let keyboardDebounceTimer = null;

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  
  if (window.visualViewport) {
    viewport.value = {
      width: window.visualViewport.width,
      height: window.visualViewport.height,
      offsetLeft: window.visualViewport.offsetLeft,
      offsetTop: window.visualViewport.offsetTop
    };

    // Smart Keyboard Detection with Debounce (Tracked for auto-cleanup)
    if (keyboardDebounceTimer) clearTimeout(keyboardDebounceTimer);
    
    keyboardDebounceTimer = tracker.trackTimeout(() => {
      const threshold = 160; 
      const keyboardVisible = (window.innerHeight - window.visualViewport.height) > threshold;
      
      if (mobileStore.isKeyboardVisible !== keyboardVisible) {
        mobileStore.setKeyboardVisibility(keyboardVisible);
        logger.debug(`Keyboard visibility changed: ${keyboardVisible}`);
      }
      keyboardDebounceTimer = null;
    }, 150);
  } else {
    viewport.value = {
      width: window.innerWidth,
      height: window.innerHeight,
      offsetLeft: 0,
      offsetTop: 0
    };
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
    // Dynamic listeners are also registered via tracker for safety
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

  // Use tracker to manage animation frames
  animationFrameId = requestAnimationFrame(() => {
    const deltaY = dragStartY - currentY;
    let newY = initialFabY + deltaY;
    
    const currentViewHeight = viewport.value.height || window.innerHeight;
    newY = Math.max(50, Math.min(currentViewHeight - 50, newY));
    
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

const onMobileFabClick = () => {
  const selection = window.getSelection();
  let selectedText = selection ? selection.toString().trim() : '';

  if (!selectedText && window.windowsManagerInstance && window.windowsManagerInstance.state) {
    selectedText = window.windowsManagerInstance.state.originalText || '';
  }

  if (selectedText) {
    mobileStore.updateSelectionData({ text: selectedText, isLoading: true, translation: '' });
    mobileStore.openSheet(MOBILE_CONSTANTS.VIEWS.SELECTION);
    if (window.windowsManagerInstance) {
      window.windowsManagerInstance._showMobileSheet(selectedText);
    }
  } else {
    let viewToOpen = mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    mobileStore.openSheet(viewToOpen);
  }
};

// Mask Style: Sized exactly to the visible viewport
const maskStyle = computed(() => {
  const { width, height, offsetLeft, offsetTop } = viewport.value;
  
  return {
    position: 'fixed !important',
    left: `${offsetLeft}px !important`,
    top: `${offsetTop}px !important`,
    width: `${width}px !important`,
    height: `${height}px !important`,
    pointerEvents: 'none !important',
    zIndex: '2147483647 !important',
    overflow: 'hidden !important',
    display: 'block !important'
  };
});

// FAB Style: Positioned relatively within the visual viewport mask
const fabStyle = computed(() => {
  const isRTL = props.isRtl;
  const y = fabPosition.value.y || 120;
  const currentOpacity = (isFabIdle.value && !isFabDragging.value && !isHovering.value) ? '0.2' : '1';
  
  return {
    position: 'absolute !important', 
    bottom: `${y}px !important`,
    left: isRTL ? '0 !important' : '100% !important',
    marginLeft: '-25px !important',
    width: '50px !important',
    height: '50px !important',
    display: 'flex !important',
    zIndex: '2147483647 !important',
    pointerEvents: 'auto !important',
    '--fab-opacity-val': currentOpacity,
    opacity: 'var(--fab-opacity-val) !important',
    transition: isFabDragging.value ? 'none' : 'opacity 0.3s ease, bottom 0.3s ease'
  };
});

onMounted(async () => {
  // Initialize Viewport Monitoring via tracker
  if (typeof window !== 'undefined' && window.visualViewport) {
    tracker.addEventListener(window.visualViewport, 'resize', updateViewport);
    tracker.addEventListener(window.visualViewport, 'scroll', updateViewport);
  } else {
    tracker.addEventListener(window, 'resize', updateViewport);
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
  // Safety: Dynamic drag listeners are manually removed, tracker handles everything else
  window.removeEventListener('mousemove', onFabDragMove);
  window.removeEventListener('mouseup', onFabDragEnd);
  
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (keyboardDebounceTimer) clearTimeout(keyboardDebounceTimer);
});
</script>

<style scoped>
.mobile-fab-viewport-mask {
  /* Critical for resize masking - isolates children from layout viewport jumps */
  contain: strict !important;
}

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