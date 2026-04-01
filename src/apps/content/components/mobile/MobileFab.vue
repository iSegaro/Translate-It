<template>
  <div 
    v-if="isReady"
    class="mobile-fab notranslate"
    :class="{ 
      'is-idle': isFabIdle && !isFabDragging && !isHovering,
      'is-dragging': isFabDragging,
      'is-positioning': isPositioning,
      'is-left': side === 'left',
      'is-right': side === 'right'
    }"
    translate="no"
    :style="dynamicVars"
    :title="t('mobile_fab_alt') || 'Translate'"
    @click="onMobileFabClick"
    @mousedown="onFabDragStart"
    @touchstart="onFabDragStart"
    @touchmove="onFabDragMove"
    @touchend="onFabDragEnd"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <img 
      src="@/icons/extension/extension_icon_64.svg" 
      :alt="t('mobile_fab_alt') || 'Translate'" 
    >
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
import { pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';

const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'MobileFab');
const { t } = useUnifiedI18n();
const mobileStore = useMobileStore();

/**
 * MEMORY MANAGEMENT: Use the centralized ResourceTracker
 */
const tracker = useResourceTracker('mobile-fab');

// State
const isReady = ref(false);
const isPositioning = ref(true);
const fabPosition = ref({ x: null, y: null });
const userPreferredY = ref(null); 
const isFabDragging = ref(false);
const isFabIdle = ref(true);
const isHovering = ref(false);
const isViewportUnstable = ref(false);
const side = ref(null); 
const isSelectionDirty = ref(false);
const pendingText = ref('');

// Internal variables
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
    isSelectionDirty.value = true;
    startFabIdleTimer();
  }
};

const checkBounds = () => {
  if (typeof window === 'undefined' || !userPreferredY.value) return;
  const maxY = window.innerHeight - 60;
  fabPosition.value.y = Math.max(50, Math.min(userPreferredY.value, maxY));
};

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  isViewportUnstable.value = true;
  checkBounds();
  
  if (instabilityTimer) {
    tracker.clearTimer(instabilityTimer);
    instabilityTimer = null;
  }
  
  instabilityTimer = tracker.trackTimeout(() => {
    isViewportUnstable.value = false;
    instabilityTimer = null;
  }, 250);
};

onMounted(async () => {
  if (typeof window !== 'undefined') {
    tracker.addEventListener(document, 'selectionchange', handleSelectionChange);
    tracker.addEventListener(window, 'scroll', updateViewport, { passive: true });
    tracker.addEventListener(window, 'resize', updateViewport);
  }

  tracker.addEventListener(pageEventBus, SELECTION_EVENTS.GLOBAL_SELECTION_CHANGE, (detail) => {
    isSelectionDirty.value = true;
    pendingText.value = detail?.text || '';
    startFabIdleTimer();
  });

  tracker.addEventListener(pageEventBus, SELECTION_EVENTS.GLOBAL_SELECTION_CLEAR, () => {
    isSelectionDirty.value = false;
    pendingText.value = '';
  });

  try {
    const savedData = await storageManager.get('MOBILE_FAB_POSITION');
    const pos = savedData.MOBILE_FAB_POSITION;
    
    if (pos) {
      userPreferredY.value = pos.y !== null ? pos.y : MOBILE_CONSTANTS.FAB.DEFAULT_Y;
      side.value = pos.side || MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    } else {
      userPreferredY.value = MOBILE_CONSTANTS.FAB.DEFAULT_Y;
      side.value = MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    }
    
    checkBounds();
    tracker.trackTimeout(() => {
      isReady.value = true;
      tracker.trackTimeout(() => { isPositioning.value = false; }, 500);
    }, 150);
  } catch (err) {
    logger.error('Failed to load mobile FAB position:', err);
    userPreferredY.value = MOBILE_CONSTANTS.FAB.DEFAULT_Y;
    fabPosition.value.y = userPreferredY.value;
    side.value = MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
    isReady.value = true;
  }
});

/**
 * NEW: Reactive CSS Variables for smooth dragging and positioning
 */
const dynamicVars = computed(() => {
  if (!isReady.value || side.value === null || fabPosition.value.y === null) {
    return { display: 'none !important' };
  }
  
  let currentOpacity = '1';
  let pointerEvents = 'auto';

  if (isViewportUnstable.value && !isFabDragging.value) {
    currentOpacity = '0';
    pointerEvents = 'none';
  } else if (isFabIdle.value && !isFabDragging.value && !isHovering.value) {
    currentOpacity = '0.2';
  }
  
  const vars = {
    '--fab-y': `${fabPosition.value.y}px`,
    '--fab-opacity': currentOpacity,
    '--fab-pointer-events': pointerEvents
  };

  if (isFabDragging.value && fabPosition.value.x !== null) {
    vars['--fab-left'] = `${fabPosition.value.x}px`;
  }

  return vars;
});

// Event Handlers
const onFabDragStart = (e) => {
  const isMouseEvent = e.type === 'mousedown';
  if (isMouseEvent && e.button !== 0) return;
  
  // PREVENT SELECTION CLEAR: This ensures clicking the FAB doesn't kill the page selection
  if (isMouseEvent) {
    e.preventDefault();
  }
  
  const point = isMouseEvent ? e : e.touches[0];
  
  isFabDragging.value = true;
  dragStartY = point.clientY;
  initialFabY = fabPosition.value.y;
  
  // Initialize X position immediately to prevent jumping during click/start
  fabPosition.value.x = point.clientX;

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
      
      // Track X position during drag for smooth visualization
      fabPosition.value.x = point.clientX;
      
      animationFrameId = null;
    });
  }
};

const onFabDragEnd = async (e) => {
  if (!isFabDragging.value) return;
  isFabDragging.value = false;
  
  const isMouseEvent = e && e.type === 'mouseup';
  if (isMouseEvent) {
    tracker.removeEventListener(window, 'mousemove', onFabDragMove);
    tracker.removeEventListener(window, 'mouseup', onFabDragEnd);
  }

  try {
    userPreferredY.value = fabPosition.value.y;
    await storageManager.set({ 
      MOBILE_FAB_POSITION: { side: side.value, y: fabPosition.value.y } 
    });
  } catch (err) {
    logger.error('Failed to save mobile FAB position:', err);
  }
  
  startFabIdleTimer();
};

const onMobileFabClick = () => {
  logger.info('Mobile FAB clicked');
  const selection = window.getSelection()?.toString().trim() || '';
  const effectiveSelection = pendingText.value || selection;
  const hasFreshSelection = effectiveSelection && (isSelectionDirty.value || effectiveSelection !== mobileStore.selectionData.text);

  if (hasFreshSelection) {
    window.windowsManagerInstance?._showMobileSheet(effectiveSelection);
    isSelectionDirty.value = false;
  } else {
    mobileStore.openSheet(mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD);
  }
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
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
});
</script>
