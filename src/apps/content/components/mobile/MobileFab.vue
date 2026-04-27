<template>
  <div 
    v-if="isReady"
    class="mobile-fab notranslate"
    :class="{ 
      'is-idle': isFabIdle && !isFabDragging && !isHovering,
      'is-dragging': isFabDragging,
      'is-positioning': isPositioning,
      'is-unstable': isViewportUnstable && !isFabDragging,
      'is-left': side === 'left',
      'is-right': side === 'right',
      'is-hidden': !side || fabPosition.y === null
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
import './MobileFab.scss';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMobileStore } from '@/store/modules/mobile.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
import ExtensionContextManager from '@/core/extensionContext.js';

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
let dragStartX = 0;
let dragStartY = 0;
let initialFabY = 0;
let animationFrameId = null;
let instabilityTimer = null;
let fabIdleTimerId = null;

const checkBounds = () => {
  if (typeof window === 'undefined' || !userPreferredY.value) return;
  
  // Use VisualViewport for more accurate visible area height on mobile
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const maxY = viewportHeight - 60;
  
  fabPosition.value.y = Math.max(50, Math.min(userPreferredY.value, maxY));
};

const updateViewport = () => {
  if (typeof window === 'undefined') return;
  
  // Only hide FAB on scroll for actual mobile devices (where toolbars hide/show)
  // This prevents flickering during translation layout shifts on desktop emulators
  if (deviceDetector.isMobile() && !window.matchMedia('(pointer: fine)').matches) {
    isViewportUnstable.value = true;
  }
  
  checkBounds();
  
  if (instabilityTimer) {
    tracker.clearTimer(instabilityTimer);
    instabilityTimer = null;
  }
  
  instabilityTimer = tracker.trackTimeout(() => {
    isViewportUnstable.value = false;
    instabilityTimer = null;
    // CRITICAL: Re-check bounds after stabilization to catch finalized innerHeight/viewport changes
    checkBounds();
  }, 250);
};

onMounted(async () => {
  // Inject Sheet-specific styles lazily into shadow root
  try {
    const { sheetUiStyles } = await import('@/core/content-scripts/chunks/lazy-styles.js');
    const { injectStylesToShadowRoot } = await import('@/utils/ui/styleInjector.js');
    
    if (sheetUiStyles && injectStylesToShadowRoot) {
      injectStylesToShadowRoot(sheetUiStyles, 'vue-sheet-specific-styles');
    }
  } catch (error) {
    console.warn('[MobileFab] Failed to load lazy styles:', error);
  }

  if (typeof window !== 'undefined') {
    // Only update on resize/orientation changes.
    // position: fixed handles scrolling automatically.
    tracker.addEventListener(window, 'resize', updateViewport);
    
    // NEW: Use VisualViewport API for better mobile support if available
    if (window.visualViewport) {
      tracker.addEventListener(window.visualViewport, 'resize', updateViewport);
      tracker.addEventListener(window.visualViewport, 'scroll', updateViewport);
    }
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
    if (ExtensionContextManager.isContextError(err)) {
      ExtensionContextManager.handleContextError(err, 'mobile-fab:load-position');
    } else {
      logger.error('Failed to load mobile FAB position:', err);
    }

    // Set defaults on any error
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
    return {};
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
    // When dragging, use explicit left coordinate
    vars['--fab-left'] = `${fabPosition.value.x}px`;
    vars['--fab-right'] = 'auto';
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
  
  dragStartX = point.clientX;
  dragStartY = point.clientY;
  initialFabY = fabPosition.value.y;
  
  // Don't set isFabDragging = true yet, wait for move threshold in Move handler
  isFabDragging.value = false;

  if (isMouseEvent) {
    tracker.addEventListener(window, 'mousemove', onFabDragMove);
    tracker.addEventListener(window, 'mouseup', onFabDragEnd);
  }
  
  isFabIdle.value = false;
};

const onFabDragMove = (e) => {
  const isMouseEvent = e.type === 'mousemove';
  const point = isMouseEvent ? e : e.touches[0];
  const currentX = point.clientX;
  const currentY = point.clientY;

  // Drag Threshold: Only start dragging if moved more than 5px from start
  if (!isFabDragging.value) {
    const moveDist = Math.sqrt(Math.pow(currentX - dragStartX, 2) + Math.pow(currentY - dragStartY, 2));
    if (moveDist > 5) {
      isFabDragging.value = true;
    } else {
      return;
    }
  }
  
  if (e.cancelable) e.preventDefault();
  
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(() => {
      const deltaY = dragStartY - currentY;
      fabPosition.value.y = Math.max(50, Math.min(window.innerHeight - 50, initialFabY + deltaY));
      
      const snapThreshold = window.innerWidth / 2;
      side.value = currentX < snapThreshold ? MOBILE_CONSTANTS.FAB.SIDE.LEFT : MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
      
      // Track X position during drag for smooth visualization
      fabPosition.value.x = currentX;
      
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
    if (ExtensionContextManager.isContextError(err)) {
      ExtensionContextManager.handleContextError(err, 'mobile-fab:save-position');
    } else {
      logger.error('Failed to save mobile FAB position:', err);
    }
  }
  
  startFabIdleTimer();
};

const onMobileFabClick = () => {
  logger.info('Mobile FAB clicked');

  try {
    const selection = window.getSelection()?.toString().trim() || '';
    const effectiveSelection = pendingText.value || selection;
    const hasFreshSelection = effectiveSelection && (isSelectionDirty.value || effectiveSelection !== mobileStore.selectionData.text);

    if (hasFreshSelection) {
      window.windowsManagerInstance?._showMobileSheet(effectiveSelection);
      isSelectionDirty.value = false;
    } else {
      mobileStore.openSheet(mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD);
    }
  } catch (err) {
    if (ExtensionContextManager.isContextError(err)) {
      ExtensionContextManager.handleContextError(err, 'mobile-fab:click');
    } else {
      logger.error('Mobile FAB click handler failed:', err);
    }
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
