<template>
  <div class="page-translation-view" style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important;">
    
    <!-- Header -->
    <div class="status-header" :style="`display: flex !important; justify-content: space-between !important; align-items: center !important; padding-bottom: 12px !important; border-bottom: 1px solid ${settingsStore.isDarkTheme ? '#333' : '#f1f3f5'} !important;`" >
      <div class="status-info" style="display: flex !important; align-items: center !important; gap: 10px !important;">
        <span class="status-dot" :class="pageTranslationData.status" style="width: 10px !important; height: 10px !important; border-radius: 50% !important; display: block !important;"></span>
        <span class="status-text" :style="`font-weight: 800 !important; font-size: 16px !important; color: ${settingsStore.isDarkTheme ? '#dee2e6' : '#343a40'} !important;`" >{{ statusMessage }}</span>
      </div>
      <div class="header-actions" style="display: flex !important; align-items: center !important; gap: 8px !important;">
        <button 
          class="header-action-btn dashboard-link" 
          @click="goToDashboard" 
          :style="`border: none !important; padding: 0 12px !important; height: 28px !important; border-radius: 20px !important; font-size: 11px !important; font-weight: 800 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; background: ${settingsStore.isDarkTheme ? '#2d2d2d' : '#f1f3f5'} !important; color: ${settingsStore.isDarkTheme ? '#adb5bd' : '#495057'} !important;`"
        >
          {{ t('mobile_page_dashboard_btn') || 'Dashboard' }}
        </button>
        
        <button class="close-btn" @click="closeView" style="background: none !important; border: none !important; padding: 4px !important; cursor: pointer !important; display: flex !important; align-items: center !important;">
          <img src="@/icons/ui/close.png" :alt="t('mobile_close_button_alt') || 'Close'" :style="`width: 20px !important; height: 20px !important; opacity: 0.4 !important; ${settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : ''}`" />
        </button>
      </div>
    </div>

    <!-- Progress Card -->
    <div 
      class="progress-card" 
      :style="{
        background: pageTranslationData.status === 'error' ? (settingsStore.isDarkTheme ? 'rgba(250, 82, 82, 0.1)' : '#fff5f5') : (settingsStore.isDarkTheme ? '#2d2d2d' : '#f8f9fa'),
        border: `1px solid ${pageTranslationData.status === 'error' ? '#ffe3e3' : '#e9ecef'} !important`,
        borderRadius: '16px !important',
        padding: '20px !important',
        display: 'flex !important',
        flexDirection: 'column !important',
        gap: '12px !important',
        transition: 'all 0.3s ease !important'
      }"
    >
      <div style="display: flex !important; justify-content: space-between !important; align-items: flex-end !important;">
        <div style="display: flex !important; flex-direction: column !important; gap: 2px !important;">
          <span 
            style="font-size: 10px !important; font-weight: 800 !important; text-transform: uppercase !important; letter-spacing: 0.5px !important;"
            :style="{ color: pageTranslationData.status === 'error' ? '#fa5252' : '#adb5bd' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_error_encountered') || 'Error Encountered') : (t('mobile_page_translation_progress') || 'Translation Progress') }}
          </span>
          <span 
            style="font-size: 20px !important; font-weight: 800 !important;"
            :style="{ color: pageTranslationData.status === 'error' ? '#fa5252' : '#339af0' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_failed_status') || 'Failed') : computedProgress + '%' }}
          </span>
        </div>
        <div 
          v-if="pageTranslationData.status !== 'error'"
          class="progress-counter"
          :style="`font-size: 12px !important; font-weight: 600 !important; padding: 4px 10px !important; border-radius: 10px !important; background: ${settingsStore.isDarkTheme ? '#1a1a1a' : '#fff'} !important; border: 1px solid ${settingsStore.isDarkTheme ? '#333' : '#eee'} !important; color: ${settingsStore.isDarkTheme ? '#868e96' : '#868e96'} !important;`"
        >
          {{ pageTranslationData.translatedCount }} / {{ pageTranslationData.totalCount || '?' }}
        </div>
      </div>

      <!-- Error Message in Progress Card -->
      <div v-if="pageTranslationData.status === 'error'" style="font-size: 13px !important; color: #fa5252 !important; font-weight: 600 !important; line-height: 1.4 !important;">
        {{ pageTranslationData.errorMessage || (t('mobile_page_unknown_error') || 'Unknown translation error') }}
      </div>

      <div class="progress-bar-container" style="height: 10px !important; border-radius: 5px !important; overflow: hidden !important; position: relative !important;" :style="{ background: pageTranslationData.status === 'error' ? '#ffe3e3' : (settingsStore.isDarkTheme ? '#1a1a1a' : '#e9ecef') }">
        <div 
          class="progress-bar-fill" 
          :style="{ 
            width: pageTranslationData.status === 'error' ? '100%' : `${computedProgress}%`,
            background: pageTranslationData.status === 'error' ? '#fa5252' : 'linear-gradient(90deg, #339af0, #22b8cf)'
          }"
          :class="{ 'indeterminate': pageTranslationData.totalCount === 0 && pageTranslationData.isTranslating }"
          style="height: 100% !important; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 0 10px rgba(51, 154, 240, 0.3) !important;"
        ></div>
      </div>
    </div>

    <!-- Unified Action Area -->
    <div class="action-column" style="margin-top: auto !important; padding-top: 10px !important;">
      
      <!-- Single Multi-state Button -->
      <button 
        @click.stop="primaryAction.handler"
        class="primary-action-btn"
        :style="{
          width: '100% !important',
          background: primaryAction.bgColor,
          border: primaryAction.border + ' !important',
          padding: '14px !important',
          borderRadius: '12px !important',
          color: primaryAction.textColor + ' !important',
          fontWeight: '700 !important',
          fontSize: '14px !important',
          cursor: 'pointer !important',
          display: 'flex !important',
          alignItems: 'center !important',
          justifyContent: 'center !important',
          gap: '8px !important',
          transition: 'all 0.2s ease !important'
        }"
      >
        <img 
          :src="primaryAction.icon" 
          style="width: 18px !important; height: 18px !important;" 
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
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { useResourceTracker } from '@/composables/core/useResourceTracker'

import wholePageIcon from '@/icons/ui/whole-page.png';
import closeIcon from '@/icons/ui/close.png';
import eyeHideIcon from '@/icons/ui/eye-hide.svg';
import restoreIcon from '@/icons/ui/restore.svg';

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
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
    return pageTranslationData.value.isAutoTranslating ? (t('mobile_page_auto_translating_status') || 'Auto-Translating') : (t('mobile_page_translated_status') || 'Page Translated');
  }
  if (pageTranslationData.value.status === 'error') return t('mobile_page_translation_failed') || 'Translation Failed';
  return t('mobile_page_ready_status') || 'Ready to Translate';
})

const primaryAction = computed(() => {
  const isError = pageTranslationData.value.status === 'error';
  const isDark = settingsStore.isDarkTheme;

  if (isError) {
    return { label: t('mobile_page_retry_btn') || 'Retry Translation', icon: wholePageIcon, bgColor: '#fa5252', textColor: 'white', border: 'none', iconFilter: 'brightness(0) invert(1)', handler: startTranslation }
  }

  if (pageTranslationData.value.isTranslating || pageTranslationData.value.isAutoTranslating) {
    const isInitialPass = pageTranslationData.value.isTranslating;
    return {
      label: isInitialPass ? (t('mobile_page_stop_btn') || 'Stop Translation') : (t('mobile_page_stop_auto_btn') || 'Stop Auto-Translation'),
      icon: isInitialPass ? closeIcon : eyeHideIcon,
      bgColor: isDark ? 'rgba(217, 72, 15, 0.15)' : '#fff4e6',
      textColor: isDark ? '#ffa94d' : '#d9480f',
      border: isDark ? '1px solid rgba(217, 72, 15, 0.3)' : '1px solid #ffe8cc',
      iconFilter: isInitialPass ? 'invert(38%) sepia(88%) saturate(1212%) hue-rotate(335deg) brightness(98%) contrast(98%)' : 'invert(36%) sepia(84%) saturate(1212%) hue-rotate(351deg) brightness(91%) contrast(92%)',
      handler: stopAutoTranslation
    }
  }

  if (pageTranslationData.value.isTranslated) {
    return { label: t('mobile_page_restore_btn') || 'Restore Original Page', icon: restoreIcon, bgColor: isDark ? '#2d2d2d' : '#f8f9fa', textColor: isDark ? '#adb5bd' : '#495057', border: isDark ? '1px solid #444' : '1px solid #dee2e6', iconFilter: 'none', handler: restorePage }
  }

  return { label: t('mobile_page_start_btn') || 'Start Translation', icon: wholePageIcon, bgColor: '#339af0', textColor: 'white', border: 'none', iconFilter: 'brightness(0) invert(1)', handler: startTranslation }
})

const goToDashboard = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) }
const closeView = () => { mobileStore.closeSheet() }
const startTranslation = () => { pageEventBus.emit(MessageActions.PAGE_TRANSLATE); mobileStore.closeSheet() }
const stopAutoTranslation = () => { pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO) }
const restorePage = () => { pageEventBus.emit(MessageActions.PAGE_RESTORE) }
</script>

<style scoped>
.status-dot { background: #adb5bd !important; }
.status-dot.translating { background: #339af0 !important; box-shadow: 0 0 0 3px rgba(51, 154, 240, 0.2) !important; animation: pulse-mobile 1.5s infinite !important; }
.status-dot.completed { background: #51cf66 !important; box-shadow: 0 0 0 3px rgba(81, 207, 102, 0.2) !important; }
.status-dot.error { background: #fa5252 !important; }

.dashboard-link { background: #f1f3f5 !important; color: #495057 !important; }
.progress-counter { background: #fff !important; color: #868e96 !important; border-color: #eee !important; }

@keyframes pulse-mobile { 0% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(0.95); opacity: 1; } }
@keyframes indeterminate-mobile { 0% { transform: translateX(-100%) scaleX(0.2); } 50% { transform: translateX(0%) scaleX(0.5); } 100% { transform: translateX(100%) scaleX(0.2); } }
.progress-bar-fill.indeterminate { animation: indeterminate-mobile 2s infinite linear !important; transform-origin: 0% 50% !important; }
button:active { transform: scale(0.98) !important; opacity: 0.8 !important; }

/* Dark Mode Support */
@media (prefers-color-scheme: dark) {
  .mobile-sheet:not(.is-dark) .status-header { border-bottom-color: #333 !important; }
  .mobile-sheet:not(.is-dark) .status-text { color: #dee2e6 !important; }
  .mobile-sheet:not(.is-dark) .dashboard-link { background: #2d2d2d !important; color: #adb5bd !important; }
  .mobile-sheet:not(.is-dark) .close-btn img { filter: invert(0.8) !important; }
  .mobile-sheet:not(.is-dark) .progress-counter { background: #1a1a1a !important; border-color: #333 !important; color: #868e96 !important; }
}

.is-dark .status-header { border-bottom-color: #333 !important; }
.is-dark .status-text { color: #dee2e6 !important; }
.is-dark .dashboard-link { background: #2d2d2d !important; color: #adb5bd !important; }
.is-dark .close-btn img { filter: invert(0.8) !important; }
.is-dark .progress-counter { background: #1a1a1a !important; border-color: #333 !important; color: #868e96 !important; }
</style>