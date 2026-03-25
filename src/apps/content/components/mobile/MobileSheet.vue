<template>
  <div 
    v-if="isOpen && !isFullscreen"
    class="mobile-sheet-overlay notranslate"
    translate="no"
    style="position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.5) !important; z-index: 2147483646 !important; pointer-events: auto !important; display: block !important;"
    @click.self="closeSheet"
  >
    <div 
      class="mobile-sheet notranslate"
      translate="no"
      :class="[`state-${sheetState}`, { 'is-dark': settingsStore.isDarkTheme }]"
      :style="[sheetStyle, activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? { touchAction: 'none !important' } : {}]"
      @touchstart="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragStart($event) : null"
      @touchmove="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragMove($event) : null"
      @touchend="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragEnd($event) : null"
    >
      <!-- Drag Handle Header -->
      <div 
        class="sheet-header" 
        style="width: 100% !important; height: 16px !important; display: flex !important; justify-content: center !important; align-items: center !important; background: transparent !important; cursor: grab !important; touch-action: none !important;"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
      >
        <div class="drag-handle" style="width: 32px !important; height: 4px !important; border-radius: 2px !important; margin-top: 8px !important;"></div>
      </div>

      <!-- Main Content Container -->
      <div 
        class="sheet-content" 
        :style="{ 
          flex: '1 !important', 
          overflowY: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? 'hidden !important' : 'auto !important', 
          padding: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? '0 !important' : '15px !important' 
        }"
      >
        <DashboardView v-if="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD" />
        <SelectionView v-if="activeView === MOBILE_CONSTANTS.VIEWS.SELECTION" />
        <InputView v-if="activeView === MOBILE_CONSTANTS.VIEWS.INPUT" />
        <PageTranslationView v-if="activeView === MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION" />
        <HistoryView v-if="activeView === MOBILE_CONSTANTS.VIEWS.HISTORY" />
      </div>

      <!-- Footer/Safe Area -->
      <div class="sheet-footer-area notranslate" style="height: env(safe-area-inset-bottom); min-height: 20px;"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useMobileGestures } from '@/composables/ui/useMobileGestures.js'
import { useTTSSmart } from '@/features/tts/composables/useTTSSmart.js'
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

// Import Mobile Views
import DashboardView from './views/DashboardView.vue'
import SelectionView from './views/SelectionView.vue'
import InputView from './views/InputView.vue'
import PageTranslationView from './views/PageTranslationView.vue'
import HistoryView from './views/HistoryView.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { isOpen, activeView, sheetState, isFullscreen } = storeToRefs(mobileStore)
const tts = useTTSSmart()

// Watch for activeView changes to stop TTS playback when navigating between views
watch(activeView, () => {
  if (tts && typeof tts.stopAll === 'function') {
    tts.stopAll();
  }
});

// Watch for isOpen changes to sync state with WindowsManager and stop audio
watch(isOpen, (newVal) => {
  if (!newVal) {
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id: 'mobile-sheet' });
    
    // Auto-stop any TTS playback when the mobile sheet is closed
    if (tts && typeof tts.stopAll === 'function') {
      tts.stopAll();
    }
  }
});

const {
  isDragging,
  sheetTranslation,
  onDragStart,
  onDragMove,
  onDragEnd,
  syncState
} = useMobileGestures({
  onClose: () => mobileStore.closeSheet(),
  onExpand: () => mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL),
  onPeek: () => mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK),
  initialState: sheetState.value
})

// Sync internal gesture state with store state changes
watch(sheetState, (newVal) => {
  if (typeof syncState === 'function') {
    syncState(newVal);
  }
}, { immediate: true });

// Standard height mapping for different views when in PEEK mode
const PEEK_HEIGHTS = {
  [MOBILE_CONSTANTS.VIEWS.DASHBOARD]: '30dvh',
  [MOBILE_CONSTANTS.VIEWS.SELECTION]: '40dvh',
  [MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION]: '40dvh',
  [MOBILE_CONSTANTS.VIEWS.INPUT]: '40dvh', // Initial peek before interaction
  [MOBILE_CONSTANTS.VIEWS.HISTORY]: '60dvh'
}

const sheetStyle = computed(() => {
  const y = isDragging.value ? sheetTranslation.value : 0;
  
  // Use FULL height (prefer dvh for mobile to account for toolbars) or specific PEEK height
  // We use 88vh/88dvh instead of 90 to give a bit more breathing room at the top for browser toolbars
  const targetHeight = sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL 
    ? '88dvh' 
    : (PEEK_HEIGHTS[activeView.value] || '40dvh');

  const isDark = settingsStore.isDarkTheme;

  return {
    transform: `translateY(${y}px)`,
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    backgroundColor: isDark ? '#1a1a1a' : 'white',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: isDark ? '0 -5px 25px rgba(0,0,0,0.4)' : '0 -5px 25px rgba(0,0,0,0.2)',
    borderRadius: '20px 20px 0 0',
    height: targetHeight,
    maxHeight: '95dvh', // Absolute limit
    paddingTop: 'env(safe-area-inset-top, 0px)', // Support for notch/status bars
    transition: isDragging.value ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), height 0.3s ease-in-out',
    overflow: 'hidden'
  }
})

const closeSheet = () => {
  mobileStore.closeSheet()
}
</script>

<style>
.mobile-sheet-overlay * {
  box-sizing: border-box !important;
}

/* Base theme styles */
.mobile-sheet {
  background-color: white !important;
  color: #333 !important;
}

.mobile-sheet.is-dark {
  background-color: #1a1a1a !important;
  color: #dee2e6 !important;
}

.drag-handle {
  background-color: #e0e0e0 !important;
}

.mobile-sheet.is-dark .drag-handle {
  background-color: #444 !important;
}

.sheet-content {
  background-color: white !important;
}

.mobile-sheet.is-dark .sheet-content {
  background-color: #1a1a1a !important;
}

.sheet-footer-area {
  background-color: white !important;
}

.mobile-sheet.is-dark .sheet-footer-area {
  background-color: #1a1a1a !important;
}
</style>