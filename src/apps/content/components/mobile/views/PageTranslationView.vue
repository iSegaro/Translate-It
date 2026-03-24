<template>
  <div class="page-translation-view" style="display: flex; flex-direction: column; height: 100%; font-family: sans-serif; gap: 15px;">
    
    <!-- Header -->
    <div class="status-header" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #f1f3f5;">
      <div class="status-info" style="display: flex; align-items: center; gap: 10px;">
        <span class="status-dot" :class="pageTranslationData.status"></span>
        <span class="status-text" style="font-weight: 800; font-size: 16px; color: #343a40;">{{ statusMessage }}</span>
      </div>
      <div class="header-actions" style="display: flex; align-items: center; gap: 8px;">
        <button 
          class="header-action-btn dashboard-link" 
          @click="goToDashboard" 
          style="background: #f1f3f5; border: none; padding: 0 12px; height: 28px; border-radius: 20px; color: #495057; font-size: 11px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; line-height: 1;"
        >
          {{ t('mobile_page_dashboard_btn') || 'Dashboard' }}
        </button>
        
        <button class="close-btn" @click="closeView" style="background: none; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center;">
          <img src="@/icons/ui/close.png" :alt="t('mobile_close_button_alt') || 'Close'" style="width: 20px !important; height: 20px !important; opacity: 0.4;" />
        </button>
      </div>
    </div>

    <!-- Progress Card -->
    <div 
      class="progress-card" 
      :style="{
        background: pageTranslationData.status === 'error' ? '#fff5f5' : '#f8f9fa',
        border: `1px solid ${pageTranslationData.status === 'error' ? '#ffe3e3' : '#e9ecef'}`,
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'all 0.3s ease'
      }"
    >
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <span 
            style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;"
            :style="{ color: pageTranslationData.status === 'error' ? '#fa5252' : '#adb5bd' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_error_encountered') || 'Error Encountered') : (t('mobile_page_translation_progress') || 'Translation Progress') }}
          </span>
          <span 
            style="font-size: 20px; font-weight: 800;"
            :style="{ color: pageTranslationData.status === 'error' ? '#fa5252' : '#339af0' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_failed_status') || 'Failed') : computedProgress + '%' }}
          </span>
        </div>
        <div 
          v-if="pageTranslationData.status !== 'error'"
          style="font-size: 12px; font-weight: 600; color: #868e96; background: #fff; padding: 4px 10px; border-radius: 10px; border: 1px solid #eee;"
        >
          {{ pageTranslationData.translatedCount }} / {{ pageTranslationData.totalCount || '?' }}
        </div>
      </div>

      <!-- Error Message in Progress Card -->
      <div v-if="pageTranslationData.status === 'error'" style="font-size: 13px; color: #fa5252; font-weight: 600; line-height: 1.4;">
        {{ pageTranslationData.errorMessage || (t('mobile_page_unknown_error') || 'Unknown translation error') }}
      </div>

      <div class="progress-bar-container" style="height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden; position: relative;" :style="{ background: pageTranslationData.status === 'error' ? '#ffe3e3' : '#e9ecef' }">
        <div 
          class="progress-bar-fill" 
          :style="{ 
            width: pageTranslationData.status === 'error' ? '100%' : `${computedProgress}%`,
            background: pageTranslationData.status === 'error' ? '#fa5252' : 'linear-gradient(90deg, #339af0, #22b8cf)'
          }"
          :class="{ 'indeterminate': pageTranslationData.totalCount === 0 && pageTranslationData.isTranslating }"
          style="height: 100%; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 10px rgba(51, 154, 240, 0.3);"
        ></div>
      </div>
    </div>

    <!-- Unified Action Area -->
    <div class="action-column" style="margin-top: auto; padding-top: 10px;">
      
      <!-- Single Multi-state Button -->
      <button 
        @click.stop="primaryAction.handler"
        class="primary-action-btn"
        :style="{
          width: '100%',
          background: primaryAction.bgColor,
          border: primaryAction.border,
          padding: '14px',
          borderRadius: '12px',
          color: primaryAction.textColor,
          fontWeight: '700',
          fontSize: '14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          transition: 'all 0.2s ease'
        }"
      >
        <img 
          :src="primaryAction.icon" 
          style="width: 18px; height: 18px;" 
          :style="{ filter: primaryAction.iconFilter }"
        />
        {{ primaryAction.label }}
      </button>

    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker'

// Import icons for dynamic usage
import wholePageIcon from '@/icons/ui/whole-page.png';
import closeIcon from '@/icons/ui/close.png';
import eyeHideIcon from '@/icons/ui/eye-hide.svg';
import restoreIcon from '@/icons/ui/restore.svg';

const mobileStore = useMobileStore()
const { pageTranslationData } = storeToRefs(mobileStore)
const { t } = useI18n()
const tracker = useResourceTracker('mobile-page-translation')

const computedProgress = computed(() => {
  if (pageTranslationData.value.status === 'completed') return 100;
  if (!pageTranslationData.value.totalCount || pageTranslationData.value.totalCount === 0) return 0;
  return Math.round((pageTranslationData.value.translatedCount / pageTranslationData.value.totalCount) * 100);
})

const statusMessage = computed(() => {
  if (pageTranslationData.value.isTranslating) return t('mobile_page_translating_status') || 'Translating Page...';
  if (pageTranslationData.value.isTranslated) {
    return pageTranslationData.value.isAutoTranslating 
      ? (t('mobile_page_auto_translating_status') || 'Auto-Translating') 
      : (t('mobile_page_translated_status') || 'Page Translated');
  }
  if (pageTranslationData.value.status === 'error') return t('mobile_page_translation_failed') || 'Translation Failed';
  return t('mobile_page_ready_status') || 'Ready to Translate';
})

// Unified Button Configuration
const primaryAction = computed(() => {
  const isError = pageTranslationData.value.status === 'error';

  // 1. ERROR State (Highest Priority)
  if (isError) {
    return {
      label: t('mobile_page_retry_btn') || 'Retry Translation',
      icon: wholePageIcon,
      bgColor: '#fa5252',
      textColor: 'white',
      border: 'none',
      iconFilter: 'brightness(0) invert(1)',
      handler: startTranslation
    }
  }

  // 2. ACTIVE State: Currently Translating OR Auto-Translating
  if (pageTranslationData.value.isTranslating || pageTranslationData.value.isAutoTranslating) {
    const isInitialPass = pageTranslationData.value.isTranslating;
    return {
      label: isInitialPass ? (t('mobile_page_stop_btn') || 'Stop Translation') : (t('mobile_page_stop_auto_btn') || 'Stop Auto-Translation'),
      icon: isInitialPass ? closeIcon : eyeHideIcon,
      bgColor: '#fff4e6',
      textColor: '#d9480f',
      border: '1px solid #ffe8cc',
      iconFilter: isInitialPass 
        ? 'invert(38%) sepia(88%) saturate(1212%) hue-rotate(335deg) brightness(98%) contrast(98%)'
        : 'invert(36%) sepia(84%) saturate(1212%) hue-rotate(351deg) brightness(91%) contrast(92%)',
      handler: stopAutoTranslation
    }
  }

  // 3. DONE State: Already translated
  if (pageTranslationData.value.isTranslated) {
    return {
      label: t('mobile_page_restore_btn') || 'Restore Original Page',
      icon: restoreIcon,
      bgColor: '#f8f9fa',
      textColor: '#495057',
      border: '1px solid #dee2e6',
      iconFilter: 'none',
      handler: restorePage
    }
  }

  // 4. READY State: Initial state
  return {
    label: t('mobile_page_start_btn') || 'Start Translation',
    icon: wholePageIcon,
    bgColor: '#339af0',
    textColor: 'white',
    border: 'none',
    iconFilter: 'brightness(0) invert(1)',
    handler: startTranslation
  }
})

const goToDashboard = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.DASHBOARD)
}

const closeView = () => {
  mobileStore.closeSheet()
}

const startTranslation = () => {
  // Emit translation event BEFORE closing the sheet to ensure it fires
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE)
  
  // Close the sheet to let user see the page being translated
  mobileStore.closeSheet()
}

const stopAutoTranslation = () => {
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO)
}

const restorePage = () => {
  pageEventBus.emit(MessageActions.PAGE_RESTORE)
}

const cancelTranslation = () => {
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE_CANCELLED)
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

button:active {
  transform: scale(0.98);
  opacity: 0.8;
}

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .status-header { border-bottom-color: #333 !important; }
  .status-text { color: #dee2e6 !important; }
  .dashboard-link { background: #2d2d2d !important; color: #adb5bd !important; }
  .close-btn img { filter: invert(0.8); }
  
  .progress-card { background: #2d2d2d !important; border-color: #3d3d3d !important; }
  .progress-card > div > div > span:last-child { color: #4dabf7 !important; }
  .progress-card > div > div:last-child { background: #1a1a1a !important; border-color: #333 !important; color: #868e96 !important; }
  .progress-bar-container { background: #1a1a1a !important; }
  
  .primary-action-btn[style*="background: #f8f9fa"] { background: #2d2d2d !important; border-color: #444 !important; color: #adb5bd !important; }
  .primary-action-btn[style*="background: #fff4e6"] { background: rgba(217, 72, 15, 0.15) !important; border-color: rgba(217, 72, 15, 0.3) !important; color: #ffa94d !important; }
  .primary-action-btn[style*="background: #fff5f5"] { background: rgba(250, 82, 82, 0.15) !important; border-color: rgba(250, 82, 82, 0.3) !important; color: #ff8787 !important; }
}
</style>