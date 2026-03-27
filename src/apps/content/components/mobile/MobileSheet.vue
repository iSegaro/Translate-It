<template>
  <div 
    v-if="isOpen && !isFullscreen"
    class="ti-m-sheet-overlay notranslate"
    translate="no"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
    style="position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.4) !important; z-index: 2147483646 !important; pointer-events: auto !important; display: block !important;"
    @click.self="closeSheet"
  >
    <div 
      class="ti-m-sheet notranslate"
      translate="no"
      :class="[`state-${sheetState}`, { 'is-dark': settingsStore.isDarkTheme }]"
      :style="[sheetStyle, themeVariables]"
    >
      <!-- Drag Handle Header -->
      <div 
        class="ti-m-sheet-header" 
        style="width: 100% !important; height: 24px !important; display: flex !important; justify-content: center !important; align-items: center !important; background: transparent !important; cursor: grab !important; touch-action: none !important; padding-top: 4px !important;"
        @touchstart.stop.prevent="onDragStart"
        @touchmove.stop.prevent="onDragMove"
        @touchend.stop="onDragEnd"
        @mousedown.stop="onDragStart"
      >
        <div
          class="ti-m-drag-handle"
          :style="{ 
            width: '40px !important', 
            height: '5px !important', 
            borderRadius: '3px !important', 
            backgroundColor: 'var(--ti-mobile-drag-handle) !important',
            opacity: '0.8 !important' 
          }"
        />
      </div>

      <!-- Main Content Container -->
      <div 
        class="ti-m-sheet-content" 
        :style="{ 
          flex: '1 !important', 
          overflowY: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? 'hidden !important' : 'auto !important', 
          padding: activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD ? '0 !important' : '15px !important',
          backgroundColor: 'inherit !important'
        }"
      >
        <DashboardView v-if="activeView === MOBILE_CONSTANTS.VIEWS.DASHBOARD" />
        <SelectionView v-if="activeView === MOBILE_CONSTANTS.VIEWS.SELECTION" />
        <InputView v-if="activeView === MOBILE_CONSTANTS.VIEWS.INPUT" />
        <PageTranslationView v-if="activeView === MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION" />
        <HistoryView v-if="activeView === MOBILE_CONSTANTS.VIEWS.HISTORY" />
      </div>

      <!-- Footer/Safe Area -->
      <div
        class="ti-m-sheet-footer-area notranslate"
        style="height: env(safe-area-inset-bottom, 10px); background-color: inherit !important; flex-shrink: 0 !important;"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker.js'

import DashboardView from './views/DashboardView.vue'
import SelectionView from './views/SelectionView.vue'
import InputView from './views/InputView.vue'
import PageTranslationView from './views/PageTranslationView.vue'
import HistoryView from './views/HistoryView.vue'

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { isOpen, activeView, sheetState, isFullscreen } = storeToRefs(mobileStore)

// MEMORY MANAGEMENT
const tracker = useResourceTracker('mobile-sheet')

// Theme variables to be injected as inline styles for maximum reliability
const themeVariables = computed(() => {
  const isDark = settingsStore.isDarkTheme
  return {
    '--ti-mobile-bg': isDark ? '#1a1a1a' : '#ffffff',
    '--ti-mobile-text': isDark ? '#ffffff' : '#333333',
    '--ti-mobile-text-secondary': isDark ? '#e9ecef' : '#495057',
    '--ti-mobile-text-muted': isDark ? '#adb5bd' : '#868e96',
    '--ti-mobile-accent': isDark ? '#90caf9' : '#339af0',
    '--ti-mobile-accent-hover': isDark ? '#e3f2fd' : '#1c7ed6',
    '--ti-mobile-accent-bg': isDark ? 'rgba(144, 202, 249, 0.15)' : '#e7f5ff',
    '--ti-mobile-border': isDark ? '#444444' : '#dee2e6',
    '--ti-mobile-header-border': isDark ? '#333333' : '#f1f3f5',
    '--ti-mobile-card-bg': isDark ? '#2d2d2d' : '#f8f9fa',
    '--ti-mobile-btn-bg': isDark ? '#3d3d3d' : '#ffffff',
    '--ti-mobile-btn-border': isDark ? '#555555' : '#dee2e6',
    '--ti-mobile-drag-handle': isDark ? '#444444' : '#bdbdbd',
    '--ti-mobile-shadow': isDark ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.2)',
    '--ti-mobile-icon-filter': isDark ? 'brightness(0) invert(1)' : 'none',
    '--ti-mobile-error': isDark ? '#ff8787' : '#fa5252',
    '--ti-mobile-error-bg': isDark ? 'rgba(255, 135, 135, 0.15)' : '#fff5f5',
    '--ti-mobile-warning': isDark ? '#ffd43b' : '#ffa94d',
    '--ti-mobile-warning-bg': isDark ? 'rgba(255, 212, 59, 0.15)' : '#fff4e6',
    '--ti-mobile-success': isDark ? '#8ce99a' : '#51cf66',
    'background-color': isDark ? '#1a1a1a !important' : '#ffffff !important'
  }
})

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
  
  // Logic for state transitions based on drag distance
  if (currentY.value > 100) {
    // Dragged down significantly -> Close
    mobileStore.closeSheet()
  } else if (currentY.value < -70) {
    // Dragged up significantly -> Expand to FULL
    if (sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK) {
      mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
    }
  } else if (currentY.value > 70 && sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.FULL) {
    // Dragged down from FULL -> Back to PEEK
    mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK)
  }
  
  currentY.value = 0
}

// Watch for isOpen to lock/unlock body scroll
watch(isOpen, (newValue) => {
  if (newValue) {
    document.body.style.overflow = 'hidden'
    document.body.style.touchAction = 'none'
  } else {
    document.body.style.overflow = ''
    document.body.style.touchAction = ''
  }
}, { immediate: true })

const sheetStyle = computed(() => {
  const y = isDragging.value ? currentY.value : 0
  const isPeek = sheetState.value === MOBILE_CONSTANTS.SHEET_STATE.PEEK
  
  // Dynamic height for peek mode based on view
  let targetHeight = isPeek ? '35vh' : '75vh'
  if (isPeek && activeView.value === MOBILE_CONSTANTS.VIEWS.DASHBOARD) {
    targetHeight = '145px'
  }
  
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
    transform: transformValue,
    position: 'fixed',
    bottom: '0',
    left: '0',
    right: '0',
    zIndex: '2147483647',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 -5px 25px var(--ti-mobile-shadow)',
    borderRadius: '20px 20px 0 0',
    height: heightValue,
    maxHeight: '95vh', 
    paddingTop: 'env(safe-area-inset-top, 0px)',
    transition: isDragging.value ? 'none' : 'transform 0.3s ease-out, height 0.3s ease-out',
    overflow: 'hidden',
    touchAction: 'none !important',
    overscrollBehavior: 'none'
  }
})

const closeSheet = () => {
  // Ensure body is unlocked before closing
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
  mobileStore.closeSheet()
}

onUnmounted(() => {
  document.body.style.overflow = ''
  document.body.style.touchAction = ''
})
</script>

<style>
/* 
  MOBILE THEME SYSTEM (Shadow DOM Compatible)
*/
:host {
  --ti-mobile-bg: #ffffff;
  --ti-mobile-shadow: rgba(0, 0, 0, 0.2);
}

.ti-m-sheet-overlay {
  /* LIGHT THEME (DEFAULT) */
  --ti-mobile-bg: #ffffff;
  --ti-mobile-text: #333333;
  --ti-mobile-text-secondary: #495057;
  --ti-mobile-accent: #339af0;
  --ti-mobile-shadow: rgba(0, 0, 0, 0.2);
}

.ti-m-sheet-overlay.is-dark,
.ti-m-sheet.is-dark {
  /* DARK THEME OVERRIDES */
  --ti-mobile-bg: #1a1a1a;
  --ti-mobile-text: #dee2e6;
  --ti-mobile-text-secondary: #adb5bd;
  --ti-mobile-accent: #74c0fc;
  --ti-mobile-shadow: rgba(0, 0, 0, 0.4);
  --ti-mobile-icon-filter: invert(92%) hue-rotate(180deg) brightness(150%) contrast(150%);
}

.ti-m-sheet {
  background-color: var(--ti-mobile-bg, #ffffff) !important;
  color: var(--ti-mobile-text, #333333) !important;
}

.ti-m-sheet-content,
.ti-m-sheet-footer-area {
  background-color: inherit !important;
}

.ti-m-sheet-overlay * {
  box-sizing: border-box !important;
}

.ti-m-sheet-overlay img {
  max-width: none !important;
  display: block !important;
}

/* GLOBAL ICON FILTERING (SHADOW DOM COMPATIBLE) */
.ti-m-icon-img, .ti-toolbar-icon {
  filter: none !important;
}

.is-dark .ti-m-icon-img, 
.is-dark .ti-toolbar-icon {
  filter: var(--ti-mobile-icon-filter) !important;
}

.ti-m-drag-handle {
  background-color: var(--ti-mobile-drag-handle, #e0e0e0) !important;
}

@keyframes pulse-mobile { 0% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(0.95); opacity: 1; } }
@keyframes indeterminate-mobile { 0% { transform: translateX(-100%) scaleX(0.2); } 50% { transform: translateX(0%) scaleX(0.5); } 100% { transform: translateX(100%) scaleX(0.2); } }
.ti-m-progress-bar-fill.indeterminate { animation: indeterminate-mobile 2s infinite linear !important; transform-origin: 0% 50% !important; }
button:active { transform: scale(0.98) !important; opacity: 0.8 !important; }
</style>