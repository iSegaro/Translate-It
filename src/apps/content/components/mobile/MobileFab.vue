<template>
  <div 
    class="mobile-fab notranslate"
    :class="{ 'is-idle': isFabIdle && !isFabDragging }"
    translate="no"
    :style="fabStyle"
    @click="onMobileFabClick"
    @mousedown="onFabDragStart"
    @touchstart="onFabDragStart"
    @touchmove="onFabDragMove"
    @touchend="onFabDragEnd"
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

// Mobile FAB Position and Drag Logic
const fabPosition = ref({ x: null, y: 120 }); // y is distance from bottom in px
const isFabDragging = ref(false);
const isFabIdle = ref(true);
let dragStartY = 0;
let initialFabY = 0;
let fabIdleTimerId = null;
let animationFrameId = null;

const startFabIdleTimer = () => {
  if (fabIdleTimerId) {
    clearTimeout(fabIdleTimerId);
  }
  isFabIdle.value = false;
  fabIdleTimerId = setTimeout(() => {
    isFabIdle.value = true;
    fabIdleTimerId = null;
  }, 1500); // 1.5 seconds of inactivity to become semi-transparent
};

const onFabDragStart = (e) => {
  const isMouseEvent = e.type === 'mousedown';
  
  // Prevent default behavior (like text selection) during drag
  if (isMouseEvent && e.button !== 0) return; // Only left click
  
  const point = isMouseEvent ? e : e.touches[0];
  isFabDragging.value = true;
  dragStartY = point.clientY;
  
  // Get current position or defaults
  initialFabY = fabPosition.value.y || 120;
  
  if (isMouseEvent) {
    window.addEventListener('mousemove', onFabDragMove);
    window.addEventListener('mouseup', onFabDragEnd);
  }
  
  startFabIdleTimer();
};

const onFabDragMove = (e) => {
  if (!isFabDragging.value) return;
  
  const isMouseEvent = e.type === 'mousemove';
  const point = isMouseEvent ? e : e.touches[0];
  const currentY = point.clientY;
  
  // Prevent page scroll while dragging
  if (e.cancelable) e.preventDefault();

  // If an update is already scheduled for the next frame, skip this one
  if (animationFrameId) return;

  // Schedule the visual update for the next animation frame (60fps optimization)
  animationFrameId = requestAnimationFrame(() => {
    const deltaY = dragStartY - currentY; // Positive means moving up
    
    // Calculate new Y from bottom
    let newY = initialFabY + deltaY;
    // Boundary checks (stay within 50px of top/bottom)
    newY = Math.max(50, Math.min(window.innerHeight - 50, newY));
    
    fabPosition.value = { ...fabPosition.value, y: newY };
    
    // Reset the flag so the next update can be scheduled
    animationFrameId = null;
  });
};

const onFabDragEnd = async (e) => {
  if (!isFabDragging.value) return;
  isFabDragging.value = false;

  // Cancel any pending animation frames
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  
  const isMouseEvent = e && e.type === 'mouseup';
  if (isMouseEvent) {
    window.removeEventListener('mousemove', onFabDragMove);
    window.removeEventListener('mouseup', onFabDragEnd);
  }
  
  // Save position to storage
  try {
    await storageManager.set({ 
      MOBILE_FAB_POSITION: { 
        x: null, // Always keep X null for vertical-only drag
        y: fabPosition.value.y 
      } 
    });
    logger.debug('Mobile FAB vertical position saved:', fabPosition.value.y);
  } catch (err) {
    logger.error('Failed to save mobile FAB position:', err);
  }
};

const onMobileFabClick = () => {
  // 1. Check for active DOM selection
  const selection = window.getSelection();
  let selectedText = selection ? selection.toString().trim() : '';

  // 2. Fallback: check WindowsManager state if DOM selection is empty 
  // (sometimes selection is lost when clicking the FAB)
  if (!selectedText && window.windowsManagerInstance && window.windowsManagerInstance.state) {
    selectedText = window.windowsManagerInstance.state.originalText || '';
  }

  if (selectedText) {
    logger.info('FAB clicked with selection, opening SelectionView');
    
    // Setup selection data
    mobileStore.updateSelectionData({
      text: selectedText,
      isLoading: true,
      translation: ''
    });
    
    // Open sheet in selection view
    mobileStore.openSheet(MOBILE_CONSTANTS.VIEWS.SELECTION, MOBILE_CONSTANTS.SHEET_STATE.PEEK);
    
    // Trigger actual translation via WindowsManager
    if (window.windowsManagerInstance) {
      window.windowsManagerInstance._showMobileSheet(selectedText);
    }
  } else {
    // Smart view recovery (Last View behavior):
    let viewToOpen = mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    
    // Fallback ONLY if selection view is active but has no data
    if (viewToOpen === MOBILE_CONSTANTS.VIEWS.SELECTION && !mobileStore.selectionData.text) {
      viewToOpen = MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    }
    
    logger.info(`FAB clicked without selection, restoring last view: ${viewToOpen}`);
    mobileStore.openSheet(viewToOpen, MOBILE_CONSTANTS.SHEET_STATE.PEEK);
  }
};

const fabStyle = computed(() => {
  const isRTL = props.isRtl;
  const y = fabPosition.value.y || 120;
  
  return {
    position: 'fixed !important',
    bottom: `${y}px !important`,
    left: isRTL ? '0 !important' : '100% !important',
    marginLeft: '-25px !important',
    width: '50px !important',
    height: '50px !important',
    display: 'flex !important',
    opacity: isFabIdle.value && !isFabDragging.value ? '0.2' : '1',
    zIndex: '2147483647 !important',
    pointerEvents: 'auto !important',
    transition: isFabDragging.value ? 'opacity 0.8s ease' : 'opacity 0.8s ease, bottom 0.3s ease'
  };
});

onMounted(async () => {
  // Load saved FAB position
  try {
    const savedPosition = await getMobileFabPositionAsync();
    if (savedPosition && (savedPosition.x !== null || savedPosition.y !== null)) {
      fabPosition.value = {
        x: savedPosition.x,
        y: savedPosition.y || 120
      };
    }
  } catch (err) {
    logger.error('Failed to load mobile FAB position:', err);
  }

  startFabIdleTimer();
});

onUnmounted(() => {
  if (fabIdleTimerId) {
    clearTimeout(fabIdleTimerId);
  }

  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
  }

  // Ensure global listeners are removed if component is unmounted during drag
  window.removeEventListener('mousemove', onFabDragMove);
  window.removeEventListener('mouseup', onFabDragEnd);
});
</script>

<style scoped>
.mobile-fab {
  background: #339af0 !important;
  border-radius: 50% !important;
  align-items: center !important;
  justify-content: flex-start !important; /* Help position icon in the visible part */
  box-shadow: 0 4px 16px rgba(51, 154, 240, 0.4) !important;
  z-index: 2147483647 !important;
  pointer-events: auto !important;
  cursor: pointer;
  transition: opacity 0.8s ease !important;
  will-change: opacity;
}

.mobile-fab:active {
  opacity: 1 !important;
}

.mobile-fab img {
  filter: brightness(0) invert(1) !important;
  transition: none !important;
}
</style>