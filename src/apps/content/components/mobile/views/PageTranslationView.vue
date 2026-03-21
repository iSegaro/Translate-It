<template>
  <div class="page-translation-view">
    <div class="status-header">
      <div class="status-info">
        <span class="status-dot" :class="pageTranslationData.status"></span>
        <span class="status-text">{{ statusMessage }}</span>
      </div>
      <div class="header-actions">
        <button class="action-link" @click="goToDashboard">Dashboard</button>
        <button class="close-btn" @click="closeView">
          <img src="@/icons/ui/close.png" alt="Close" style="width: 20px !important; height: 20px !important;" />
        </button>
      </div>
    </div>

    <div class="progress-container">
      <div class="progress-bar-bg">
        <div 
          class="progress-bar-fill" 
          :style="{ width: `${pageTranslationData.progress}%` }"
        ></div>
      </div>
      <div class="progress-stats">
        <span>{{ pageTranslationData.translatedCount }} elements</span>
        <span>{{ Math.round(pageTranslationData.progress) }}%</span>
      </div>
    </div>

    <div class="action-row" v-if="pageTranslationData.status === 'completed'">
      <button class="restore-btn" @click="restorePage">
        Restore Original
      </button>
    </div>
    
    <div class="action-row" v-else-if="pageTranslationData.status === 'translating'">
      <button class="cancel-btn" @click="cancelTranslation">
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

const statusMessage = computed(() => {
  switch (pageTranslationData.value.status) {
    case 'translating': return 'Translating...'
    case 'completed': return 'Translated'
    case 'error': return 'Failed'
    default: return 'Starting...'
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
.page-translation-view { padding: 8px 0; }
.status-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.status-info { display: flex; align-items: center; gap: 8px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #adb5bd; }
.status-dot.translating { background: #339af0; animation: pulse 1s infinite; }
.status-dot.completed { background: #51cf66; }
.status-dot.error { background: #fa5252; }
@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
.status-text { font-weight: 600; font-size: 16px; color: #212529; }
.header-actions { display: flex; align-items: center; gap: 12px; }
.action-link { background: none; border: none; color: #339af0; font-size: 14px; font-weight: 600; cursor: pointer; padding: 0; }
.close-btn { background: none; border: none; padding: 4px; display: flex; align-items: center; }
.progress-container { margin-bottom: 24px; }
.progress-bar-bg { height: 8px; background: #f1f3f5; border-radius: 4px; overflow: hidden; margin-bottom: 8px; }
.progress-bar-fill { height: 100%; background: #339af0; transition: width 0.3s ease; }
.progress-stats { display: flex; justify-content: space-between; font-size: 12px; color: #868e96; }
.action-row { display: flex; gap: 12px; }
.restore-btn, .cancel-btn { flex: 1; padding: 10px; border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer; }
.restore-btn { background: #f1f3f5; border: 1px solid #dee2e6; color: #495057; }
.cancel-btn { background: #fff5f5; border: 1px solid #ffc9c9; color: #fa5252; }
@media (prefers-color-scheme: dark) {
  .status-text { color: #f8f9fa; }
  .close-btn img { filter: invert(1); }
  .progress-bar-bg { background: #333; }
  .restore-btn { background: #2d2d2d; border-color: #444; color: #adb5bd; }
}
</style>
