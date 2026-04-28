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
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <div class="mobile-fab-inner">
      <img 
        src="@/icons/extension/extension_icon_64.svg" 
        :alt="t('mobile_fab_alt') || 'Translate'" 
      >

      <!-- Page Translation Status Badge -->
      <Transition
        name="fade-scale"
      >
        <PageTranslationStatus 
          v-if="pageTranslationStatus.isActive" 
          mode="desktop-fab" 
        />
      </Transition>
    </div>
  </div>
</template>

<script setup>
import './MobileFab.scss';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useMobileStore } from '@/store/modules/mobile.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { MOBILE_CONSTANTS, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import { SELECTION_EVENTS } from '@/features/text-selection/events/SelectionEvents.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import PageTranslationStatus from '@/components/shared/PageTranslationStatus.vue';

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

// Page Translation Status (Mirroring Desktop FAB)
const pageTranslationStatus = computed(() => {
  const data = mobileStore.pageTranslationData;
  const isTranslating = data.status === TRANSLATION_STATUS.TRANSLATING;
  const isAuto = data.isAutoTranslating;
  
  const isCompleted = !isTranslating && !isAuto && (
    data.isTranslated || 
    data.status === TRANSLATION_STATUS.COMPLETED || 
    (data.totalCount > 0 && data.translatedCount >= data.totalCount)
  );
  
  const isError = data.status === TRANSLATION_STATUS.ERROR;
  const isActive = isTranslating || isAuto || isCompleted || isError;
  const percent = data.totalCount > 0 ? Math.round((data.translatedCount / data.totalCount) * 100) : 0;
  
  return { isActive, isTranslating, isAuto, isCompleted, isError, percent };
});

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
  if (typeof window === 'undefined' || userPreferredY.value === null) return;
  
  // Use VisualViewport for more accurate visible area height on mobile
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  if (userPreferredY.value === -1) {
    fabPosition.value.y = Math.round(viewportHeight / 2);
    return;
  }

  const maxY = viewportHeight - 80;
  fabPosition.value.y = Math.max(20, Math.min(userPreferredY.value, maxY));
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
    
    // Settle position before showing to prevent jumps
    tracker.trackTimeout(() => {
      isReady.value = true;
      
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // If position not saved, settle it now based on current calculated default
          // ONLY if it was not already a default centered position (-1)
          if (fabPosition.value.y !== null && userPreferredY.value !== -1) {
            userPreferredY.value = fabPosition.value.y;
          }
          
          tracker.trackTimeout(() => {
            isPositioning.value = false;
          }, 150);
        });
      });
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

  // Listen for error resets to ensure UI stays in sync
  tracker.trackResource('error-reset-sync', pageEventBus.on(MessageActions.PAGE_TRANSLATE_RESET_ERROR, () => {
    if (pageTranslationStatus.value.isError) {
      logger.debug('Mobile FAB Error state reset via event');
    }
  }));
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
  
  const point = isMouseEvent ? e : e.touches[0];
  
  dragStartX = point.clientX;
  dragStartY = point.clientY;
  initialFabY = fabPosition.value.y;
  
  // Don't set isFabDragging = true yet, wait for move threshold in Move handler
  isFabDragging.value = false;

  if (isMouseEvent) {
    tracker.addEventListener(window, 'mousemove', onFabDragMove);
    tracker.addEventListener(window, 'mouseup', onFabDragEnd);
  } else {
    // For touch, we must use window listeners with passive: false to allow preventDefault
    tracker.addEventListener(window, 'touchmove', onFabDragMove, { passive: false });
    tracker.addEventListener(window, 'touchend', onFabDragEnd);
  }
  
  isFabIdle.value = false;
};

const onFabDragMove = (e) => {
  const isMouseEvent = e.type === 'mousemove';
  const point = isMouseEvent ? e : e.touches[0];
  
  // CRITICAL: Prevent page scroll during FAB drag
  if (!isMouseEvent && e.cancelable) {
    e.preventDefault();
  }

  const currentX = point.clientX;
  const currentY = point.clientY;

  // Drag Threshold: Only start dragging if moved more than 5px from start
  if (!isFabDragging.value) {
    const dx = currentX - dragStartX;
    const dy = currentY - dragStartY;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      isFabDragging.value = true;
      
      // Re-sync starting coordinates to current point to ensure smooth transition from threshold
      dragStartX = currentX;
      dragStartY = currentY;
      initialFabY = fabPosition.value.y;
    } else {
      return;
    }
  }
  
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(() => {
      // Inverted delta because we are controlling 'bottom' property
      // Moving finger UP (smaller currentY) should INCREASE 'bottom'
      const deltaY = dragStartY - currentY;
      const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      fabPosition.value.y = Math.max(20, Math.min(viewportHeight - 80, initialFabY + deltaY));
      
      const snapThreshold = window.innerWidth / 2;
      side.value = currentX < snapThreshold ? MOBILE_CONSTANTS.FAB.SIDE.LEFT : MOBILE_CONSTANTS.FAB.SIDE.RIGHT;
      
      // Track X position during drag for smooth visualization
      fabPosition.value.x = currentX;
      
      animationFrameId = null;
    });
  }
};

const onFabDragEnd = async (e) => {
  const isMouseEvent = e && (e.type === 'mouseup' || e.type === 'mousemove');
  
  if (isMouseEvent) {
    tracker.removeEventListener(window, 'mousemove', onFabDragMove);
    tracker.removeEventListener(window, 'mouseup', onFabDragEnd);
  } else {
    tracker.removeEventListener(window, 'touchmove', onFabDragMove);
    tracker.removeEventListener(window, 'touchend', onFabDragEnd);
  }

  if (!isFabDragging.value) return;
  isFabDragging.value = false;

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
