<template>
  <div 
    v-if="isOpen"
    class="mobile-sheet-overlay"
    style="position: fixed !important; top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important; background: rgba(0, 0, 0, 0.5) !important; z-index: 2147483646 !important; pointer-events: auto !important; display: block !important;"
    @click.self="closeSheet"
  >
    <div 
      class="mobile-sheet"
      :class="[`state-${sheetState}`]"
      :style="sheetStyle"
    >
      <!-- Drag Handle Header -->
      <div 
        class="sheet-header" 
        style="width: 100% !important; height: 40px !important; display: flex !important; justify-content: center !important; align-items: center !important; background: transparent !important; cursor: grab !important; touch-action: none !important;"
        @touchstart="onDragStart"
        @touchmove="onDragMove"
        @touchend="onDragEnd"
      >
        <div style="width: 40px !important; height: 6px !important; background: #e0e0e0 !important; border-radius: 3px !important;"></div>
      </div>

      <!-- Main Content Container -->
      <div class="sheet-content" style="flex: 1 !important; overflow-y: auto !important; background: white !important; padding: 20px !important;">
        <DashboardView v-if="activeView === 'dashboard'" />
        <SelectionView v-if="activeView === 'selection'" />
        <InputView v-if="activeView === 'input'" />
        <PageTranslationView v-if="activeView === 'page_translation'" />
      </div>

      <!-- Footer/Safe Area -->
      <div style="height: env(safe-area-inset-bottom); min-height: 20px; background: white;"></div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useMobileGestures } from '@/composables/ui/useMobileGestures.js'

// Import Mobile Views
import DashboardView from './views/DashboardView.vue'
import SelectionView from './views/SelectionView.vue'
import InputView from './views/InputView.vue'
import PageTranslationView from './views/PageTranslationView.vue'

const mobileStore = useMobileStore()
const { isOpen, activeView, sheetState } = storeToRefs(mobileStore)

const {
  isDragging,
  sheetTranslation,
  onDragStart,
  onDragMove,
  onDragEnd
} = useMobileGestures({
  onClose: () => mobileStore.closeSheet(),
  onExpand: () => mobileStore.setSheetState('full'),
  onPeek: () => mobileStore.setSheetState('peek'),
  initialState: sheetState.value
})

const sheetStyle = computed(() => {
  const y = isDragging.value ? sheetTranslation.value : 0;
  return {
    transform: `translateY(${y}px)`,
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    width: '100%',
    backgroundColor: 'white',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    transition: isDragging.value ? 'none' : 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    boxShadow: '0 -5px 25px rgba(0,0,0,0.2)',
    borderRadius: '20px 20px 0 0',
    height: sheetState.value === 'full' ? '90vh' : '40vh',
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
