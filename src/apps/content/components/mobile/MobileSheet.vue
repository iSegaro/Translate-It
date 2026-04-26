<template>
  <div 
    v-if="isOpen && !isFullscreen"
    class="ti-m-sheet-overlay notranslate"
    translate="no"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
    @click.self="closeSheet"
  >
    <div 
      class="ti-m-sheet notranslate"
      translate="no"
      :class="[`state-${sheetState}`, { 'is-dark': settingsStore.isDarkTheme }]"
      :style="sheetStyle"
    >
      <!-- Drag Handle Header -->
      <div 
        class="ti-m-sheet-header" 
        @touchstart.stop.prevent="onDragStart"
        @touchmove.stop.prevent="onDragMove"
        @touchend.stop="onDragEnd"
        @mousedown.stop="onDragStart"
      >
        <div class="ti-m-drag-handle" />
      </div>

      <!-- Main Content Container -->
      <div 
        class="ti-m-sheet-content" 
        :class="{ 'view-dashboard': activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD }"
      >
        <DashboardView v-if="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD" />
        <SelectionView v-if="activeView === MOBILE_CONSTANTS.VIEWS.SELECTION" />
        <InputView v-if="activeView === MOBILE_CONSTANTS.VIEWS.INPUT" />
        <PageTranslationView v-if="activeView === MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION" />
        <HistoryView v-if="activeView === MOBILE_CONSTANTS.VIEWS.HISTORY" />
      </div>

      <!-- Footer/Safe Area -->
      <div class="ti-m-sheet-footer-area notranslate" />
    </div>
  </div>
</template>

<script setup>
import './MobileSheet.scss'
import { computed, ref, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

import DashboardView from './views/DashboardView.vue'
import SelectionView from './views/SelectionView.vue'
import InputView from './views/InputView.vue'
import PageTranslationView from './views/PageTranslationView.vue'
import HistoryView from './views/HistoryView.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { isOpen, activeView, sheetState, isFullscreen } = storeToRefs(mobileStore)
const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'MobileSheet')

// MEMORY MANAGEMENT
const tracker = useResourceTracker('mobile-sheet')

// Drag and drop logic
const startY = ref(0)
const currentY = ref(0)
const isDragging = ref(false)

const onDragStart = (e) => {
  isDragging.value = true
  startY.value = e.touches ? e.touches[0].clientY : e.clientY
  currentY.value = 0
  
  if (!e.touches) {
    tracker.addEventListener(window, 'mousemove', onDragMove)
    tracker.addEventListener(window, 'mouseup', onDragEnd)
  }
}

const onDragMove = (e) => {
  if (!isDragging.value) return
  const y = e.touches ? e.touches[0].clientY : e.clientY
  currentY.value = y - startY.value
}

const onDragEnd = (e) => {
  if (!isDragging.value) return
  isDragging.value = false
  
  const isMouseEvent = e && e.type === 'mouseup';
  if (isMouseEvent) {
    tracker.removeEventListener(window, 'mousemove', onDragMove)
    tracker.removeEventListener(window, 'mouseup', onDragEnd)
  }
  
  const dragDistance = currentY.value
  const isFullState = sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL
  
  // State-aware navigation logic
  if (isFullState) {
    if (dragDistance > 250) {
      // Very large drag down from FULL -> Close
      logger.debug('Mobile sheet closed via large drag from FULL');
      mobileStore.closeSheet()
    } else if (dragDistance > 70) {
      // Moderate drag down from FULL -> Go to PEEK
      logger.debug('Mobile sheet state changed: FULL -> PEEK');
      mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
    }
  } else {
    // We are in PEEK state
    if (dragDistance > 100) {
      // Drag down from PEEK -> Close
      logger.debug('Mobile sheet closed via drag from PEEK');
      mobileStore.closeSheet()
    } else if (dragDistance < -70) {
      // Drag up from PEEK -> Go to FULL
      logger.info('Mobile sheet expanded: PEEK -> FULL');
      mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
    }
  }
  
  currentY.value = 0
}

// Watch for isOpen to lock/unlock body scroll
watch(isOpen, (newValue) => {
  logger.info(newValue ? 'Mobile sheet opened' : 'Mobile sheet closed', { view: activeView.value });
  // Check if the device has a mouse/fine pointer
  const hasMouse = window.matchMedia('(pointer: fine)').matches;
  
  // Only lock scroll if:
  // 1. It is open
  // 2. We are NOT on a device with a mouse (Desktop/Laptop)
  if (newValue && !hasMouse) {
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
    // CRITICAL: Also lock documentElement to prevent horizontal scroll issues on mobile
    document.documentElement.style.overflow = 'hidden'
  } else {
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
    document.documentElement.style.overflow = ''
  }
}, { immediate: true })

const sheetStyle = computed(() => {
  const y = isDragging.value ? currentY.value : 0
  const isPeek = sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK
  
  // Use VisualViewport height for more stable calculations on mobile
  const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  
  // Dynamic height for peek mode based on view using px for stability
  let targetHeightPx = isPeek ? (viewportHeight * 0.35) : (viewportHeight * 0.75);
  
  if (isPeek) {
    if (activeView.value === MOBILE_CONSTANTS.VIEWS.DASHBOARD) {
      targetHeightPx = 180
    } else if (activeView.value === MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION) {
      // Stabilize height for page translation to prevent jumping and content overflow
      targetHeightPx = 220
    }
  }
  
  const targetHeight = `${targetHeightPx}px`
  let transformValue = 'translateY(0)'
  let heightValue = targetHeight

  if (isDragging.value) {
    if (y > 0) {
      transformValue = `translateY(${y}px)`
    } else {
      heightValue = `calc(${targetHeight} + ${Math.abs(y)}px)`
    }
  }

  return {
    '--sheet-transform': transformValue,
    '--sheet-transition': isDragging.value ? 'none' : 'transform 0.3s ease-out, height 0.3s ease-out',
    '--sheet-height': heightValue
  }
})

const closeSheet = () => {
  // Ensure body/html are unlocked before closing
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
  document.documentElement.style.overflow = ''
  mobileStore.closeSheet()
}

onUnmounted(() => {
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
  document.documentElement.style.overflow = ''
})
</script>
