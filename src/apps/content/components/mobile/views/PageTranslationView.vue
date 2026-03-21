<template>
  <div class="page-translation-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div class="status-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f3f5;">
      <div class="status-info" style="display: flex; align-items: center; gap: 10px;">
        <span class="status-dot" :class="pageTranslationData.status"></span>
        <span class="status-text" style="font-weight: 800; font-size: 16px; color: #343a40;">{{ statusMessage }}</span>
      </div>
      <div class="header-actions" style="display: flex; align-items: center; gap: 8px;">
        <!-- Restore Button in Header (Visible when completed) -->
        <button 
          v-if="pageTranslationData.status === 'completed'"
          class="header-action-btn restore-small" 
          @click="restorePage" 
          style="background: #ebfbee; border: none; padding: 0 12px; height: 28px; border-radius: 20px; color: #2b8a3e; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; line-height: 1;"
        >
          <img src="@/icons/ui/restore.svg" style="width: 12px; height: 12px; filter: invert(36%) sepia(51%) saturate(541%) hue-rotate(86deg) brightness(94%) contrast(88%); display: block; position: relative; top: -0.5px;" />
          <span style="display: block;">Restore</span>
        </button>

        <button 
          class="header-action-btn dashboard-link" 
          @click="goToDashboard" 
          style="background: #f1f3f5; border: none; padding: 0 12px; height: 28px; border-radius: 20px; color: #495057; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;"
        >
          Dashboard
        </button>
        
        <button class="close-btn" @click="closeView" style="background: none; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center;">
          <img src="@/icons/ui/close.png" alt="Close" style="width: 20px !important; height: 20px !important; opacity: 0.4;" />
        </button>
      </div>
    </div>

    <!-- Progress Card -->
    <div class="progress-card" style="background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span style="font-size: 10px; font-weight: 800; color: #adb5bd; text-transform: uppercase; letter-spacing: 0.5px;">Translation Progress</span>
          <span style="font-size: 20px; font-weight: 800; color: #339af0;">
            {{ computedProgress }}%
          </span>
        </div>
        <div style="font-size: 12px; font-weight: 600; color: #868e96; background: #fff; padding: 4px 10px; border-radius: 10px; border: 1px solid #eee;">
          {{ pageTranslationData.translatedCount }} / {{ pageTranslationData.totalCount || '?' }}
        </div>
      </div>

      <div class="progress-bar-container" style="height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden; position: relative;">
        <div 
          class="progress-bar-fill" 
          :style="{ width: `${computedProgress}%` }"
          :class="{ 'indeterminate': pageTranslationData.totalCount === 0 && pageTranslationData.status === 'translating' }"
          style="height: 100%; background: linear-gradient(90deg, #339af0, #22b8cf); transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(51, 154, 240, 0.3);"
        ></div>
      </div>
    </div>

    <!-- Bottom Actions Area -->
    <div class="action-row" style="margin-top: auto; padding-top: 10px;">
      <button 
        v-if="pageTranslationData.status === 'translating'" 
        class="cancel-btn" 
        @click="cancelTranslation"
        style="width: 100%; background: #fff5f5; border: 1px solid #ffc9c9; padding: 14px; border-radius: 12px; color: #fa5252; font-weight: 700; font-size: 14px; cursor: pointer;"
      >
        Stop Translation
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

const mobileStore = useMobileStore()
const { pageTranslationData } = storeToRefs(mobileStore)

const computedProgress = computed(() => {
  if (pageTranslationData.value.status === 'completed') return 100;
  if (!pageTranslationData.value.totalCount || pageTranslationData.value.totalCount === 0) return 0;
  return Math.round((pageTranslationData.value.translatedCount / pageTranslationData.value.totalCount) * 100);
})

const statusMessage = computed(() => {
  switch (pageTranslationData.value.status) {
    case 'translating': return 'Translating Page...'
    case 'completed': return 'Page Translated'
    case 'error': return 'Translation Failed'
    default: return 'Initializing...'
  }
})

const goToDashboard = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}

const closeView = () => {
  mobileStore.closeSheet()
}

const restorePage = () => {
  pageEventBus.emit(MessageActions.PAGE_RESTORE)
  mobileStore.resetPageTranslation()
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}

const cancelTranslation = () => {
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE_CANCELLED)
  mobileStore.resetPageTranslation()
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}
</script>

<style>
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #adb5bd;
}

.status-dot.translating {
  background: #339af0;
  box-shadow: 0 0 0 3px rgba(51, 154, 240, 0.2);
  animation: pulse-mobile 1.5s infinite;
}

.status-dot.completed {
  background: #51cf66;
  box-shadow: 0 0 0 3px rgba(81, 207, 102, 0.2);
}

.status-dot.error {
  background: #fa5252;
}

@keyframes pulse-mobile {
  0% { transform: scale(0.95); opacity: 1; }
  50% { transform: scale(1.1); opacity: 0.7; }
  100% { transform: scale(0.95); opacity: 1; }
}

.progress-bar-fill.indeterminate {
  animation: indeterminate-mobile 2s infinite linear;
  transform-origin: 0% 50%;
}

@keyframes indeterminate-mobile {
  0% { transform: translateX(-100%) scaleX(0.2); }
  50% { transform: translateX(0%) scaleX(0.5); }
  100% { transform: translateX(100%) scaleX(0.2); }
}

.cancel-btn:active, .dashboard-link:active, .header-action-btn:active {
  transform: scale(0.98);
  opacity: 0.8;
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .status-header { border-bottom-color: #333 !important; }
  .status-text { color: #dee2e6 !important; }
  .dashboard-link { background: #2d2d2d !important; color: #adb5bd !important; }
  .restore-small { background: rgba(43, 138, 62, 0.2) !important; color: #51cf66 !important; }
  .restore-small img { filter: invert(68%) sepia(43%) saturate(432%) hue-rotate(82deg) brightness(92%) contrast(88%) !important; }
  .close-btn img { filter: invert(0.8); }
  
  .progress-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .progress-card > div > div > span:last-child { color: #4dabf7 !important; }
  .progress-card > div > div:last-child { background: #1a1a1a !important; border-color: #333 !important; color: #868e96 !important; }
  .progress-bar-container { background: #1a1a1a !important; }
  
  .cancel-btn { background: rgba(250, 82, 82, 0.1) !important; border-color: rgba(250, 82, 82, 0.2) !important; }
}
</style>
