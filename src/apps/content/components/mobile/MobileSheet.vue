<template>
  <div 
    v-if="isOpen"
    class="mobile-sheet-overlay notranslate"
    translate="no"
    style="position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; background: rgba(0, 0, 0, 0.5) !important; z-index: 2147483646 !important; pointer-events: auto !important; display: block !important;"
    @click.self="closeSheet"
  >
    <div 
      class="mobile-sheet notranslate"
      translate="no"
      :class="[`state-${sheetState}`]"
      :style="[sheetStyle, activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? { touchAction: 'none !important' } : {}]"
      @touchstart="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragStart($event) : null"
      @touchmove="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragMove($event) : null"
      @touchend="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? onDragEnd($event) : null"
    >
      <!-- Drag Handle Header -->
      <div 
        class="sheet-header" 
        style="width: 100% !important; height: 24px !important; display: flex !important; justify-content: center !important; align-items: center !important; background: transparent !important; cursor: grab !important; touch-action: none !important;"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
      >
        <div style="width: 36px !important; height: 4px !important; background: #e0e0e0 !important; border-radius: 2px !important;"></div>
      </div>

      <!-- Main Content Container -->
      <div 
        class="sheet-content" 
        :style="{ 
          flex: '1 !important', 
          overflowY: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? 'hidden !important' : 'auto !important', 
          background: 'white !important', 
          padding: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? '0 !important' : '20px !important' 
        }"
      >
        <DashboardView v-if="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD" />
        <SelectionView v-if="activeView === MOBILE_CONSTANTS.VIEWS.SELECTION" />
        <InputView v-if="activeView === MOBILE_CONSTANTS.VIEWS.INPUT" />
        <PageTranslationView v-if="activeView === MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION" />
      </div>

      <!-- Footer/Safe Area -->
      <div class="notranslate" style="height: env(safe-area-inset-bottom); min-height: 20px; background: white;"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useMobileGestures } from '@/composables/ui/useMobileGestures.js'
import { pageEventBus, WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

// Import Mobile Views
import DashboardView from './views/DashboardView.vue'
import SelectionView from './views/SelectionView.vue'
import InputView from './views/InputView.vue'
import PageTranslationView from './views/PageTranslationView.vue'

const mobileStore = useMobileStore()
const { isOpen, activeView, sheetState } = storeToRefs(mobileStore)

// Watch for isOpen changes to sync state with WindowsManager
watch(isOpen, (newVal) => {
  if (!newVal) {
    pageEventBus.emit(WINDOWS_MANAGER_EVENTS.DISMISS_WINDOW, { id: 'mobile-sheet' });
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

const sheetStyle = computed(() => {
  const y = isDragging.value ? sheetTranslation.value : 0;
  return {
    transform: `translateY(${y}px)`,
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    backgroundColor: 'white',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    transition: isDragging.value ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    boxShadow: '0 -5px 25px rgba(0,0,0,0.2)',
    borderRadius: '20px 20px 0 0',
    height: sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL 
      ? '90vh' 
      : (activeView.value === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? '18vh' : '40vh'),
    maxHeight: '90vh'
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

@media (prefers-color-scheme: dark) {
  .mobile-sheet {
    background-color: #1a1a1a !important;
  }
  .sheet-header div {
    background-color: #444 !important;
  }
  .sheet-content {
    background-color: #1a1a1a !important;
  }
  .sheet-footer-area {
    background-color: #1a1a1a !important;
  }
}
</style>
