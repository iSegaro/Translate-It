<template>
  <div
    class="ti-m-page-translation-view"
    style="display: flex !important; flex-direction: column !important; height: 100% !important; font-family: sans-serif !important; gap: 15px !important; background-color: inherit !important;"
  >
    <!-- Header -->
    <div
      class="ti-m-status-header"
      style="display: flex !important; justify-content: space-between !important; align-items: center !important; padding-bottom: 12px !important; border-bottom: 1px solid var(--ti-mobile-header-border) !important;"
    >
      <div
        class="ti-m-status-info"
        style="display: flex !important; align-items: center !important; gap: 10px !important;"
      >
        <span
          class="ti-m-status-dot"
          :class="pageTranslationData.status"
          style="width: 10px !important; height: 10px !important; border-radius: 50% !important; display: block !important;"
        />
        <span
          class="ti-m-status-text"
          style="font-weight: 800 !important; font-size: 16px !important; color: var(--ti-mobile-text) !important;"
        >{{ statusMessage }}</span>
      </div>
      <div
        class="ti-m-header-actions"
        style="display: flex !important; align-items: center !important; gap: 8px !important;"
      >
        <button 
          class="ti-m-header-action-btn ti-m-dashboard-link" 
          style="border: none !important; padding: 0 12px !important; height: 28px !important; border-radius: 20px !important; font-size: 11px !important; font-weight: 800 !important; cursor: pointer !important; display: flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; background: var(--ti-mobile-btn-bg) !important; color: var(--ti-mobile-text-secondary) !important;" 
          @click="goToDashboard"
        >
          {{ t('mobile_page_dashboard_btn') || 'Dashboard' }}
        </button>
        
        <button
          class="ti-m-close-btn"
          style="background: none !important; border: none !important; padding: 4px !important; cursor: pointer !important; display: flex !important; align-items: center !important;"
          @click="closeView"
        >
          <img
            src="@/icons/ui/close.png"
            :alt="t('mobile_close_button_alt') || 'Close'"
            class="ti-m-icon-img-close"
            style="width: 20px !important; height: 20px !important; opacity: 0.4 !important;"
          >
        </button>
      </div>
    </div>

    <!-- Progress Card -->
    <div 
      class="ti-m-progress-card" 
      :style="{
        background: pageTranslationData.status === 'error' ? 'var(--ti-mobile-error-bg)' : 'var(--ti-mobile-card-bg)',
        border: `1px solid ${pageTranslationData.status === 'error' ? 'var(--ti-mobile-error)' : 'var(--ti-mobile-border)'} !important`,
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
            :style="{ color: pageTranslationData.status === 'error' ? 'var(--ti-mobile-error)' : 'var(--ti-mobile-text-muted)' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_error_encountered') || 'Error Encountered') : (t('mobile_page_translation_progress') || 'Translation Progress') }}
          </span>
          <span 
            style="font-size: 20px !important; font-weight: 800 !important;"
            :style="{ color: pageTranslationData.status === 'error' ? 'var(--ti-mobile-error)' : 'var(--ti-mobile-accent)' }"
          >
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_failed_status') || 'Failed') : computedProgress + '%' }}
          </span>
        </div>
        <div 
          v-if="pageTranslationData.status !== 'error'"
          class="ti-m-progress-counter"
          style="font-size: 12px !important; font-weight: 600 !important; padding: 4px 10px !important; border-radius: 10px !important; background: var(--ti-mobile-bg) !important; border: 1px solid var(--ti-mobile-header-border) !important; color: var(--ti-mobile-text-muted) !important;"
        >
          {{ pageTranslationData.translatedCount }} / {{ pageTranslationData.totalCount || '?' }}
        </div>
      </div>

      <!-- Error Message in Progress Card -->
      <div
        v-if="pageTranslationData.status === 'error'"
        style="font-size: 13px !important; color: var(--ti-mobile-error) !important; font-weight: 600 !important; line-height: 1.4 !important;"
      >
        {{ pageTranslationData.errorMessage || (t('mobile_page_unknown_error') || 'Unknown translation error') }}
      </div>

      <div
        class="ti-m-progress-bar-container"
        style="height: 10px !important; border-radius: 5px !important; overflow: hidden !important; position: relative !important;"
        :style="{ background: pageTranslationData.status === 'error' ? 'var(--ti-mobile-error-bg)' : 'var(--ti-mobile-header-border)' }"
      >
        <div 
          class="ti-m-progress-bar-fill" 
          :style="{ 
            width: pageTranslationData.status === 'error' ? '100%' : `${computedProgress}%`,
            background: pageTranslationData.status === 'error' ? 'var(--ti-mobile-error)' : 'linear-gradient(90deg, var(--ti-mobile-accent), var(--ti-mobile-accent-hover))'
          }"
          :class="{ 'indeterminate': pageTranslationData.totalCount === 0 && pageTranslationData.isTranslating }"
          style="height: 100% !important; transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1) !important; box-shadow: 0 0 10px rgba(51, 154, 240, 0.3) !important;"
        />
      </div>
    </div>

    <!-- Unified Action Area -->
    <div
      class="ti-m-action-column"
      style="margin-top: auto !important; padding-top: 10px !important;"
    >
      <!-- Single Multi-state Button -->
      <button 
        class="ti-m-primary-action-btn"
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
        @click.stop="primaryAction.handler"
      >
        <img 
          :src="primaryAction.icon" 
          style="width: 18px !important; height: 18px !important;" 
          :style="{ filter: primaryAction.iconFilter }"
        >
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

import wholePageIcon from '@/icons/ui/whole-page.png';
import closeIcon from '@/icons/ui/close.png';
import eyeHideIcon from '@/icons/ui/eye-hide.svg';
import restoreIcon from '@/icons/ui/restore.svg';

const mobileStore = useMobileStore()
const { pageTranslationData } = storeToRefs(mobileStore)
const { t } = useI18n()

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

  if (isError) {
    return { label: t('mobile_page_retry_btn') || 'Retry Translation', icon: wholePageIcon, bgColor: 'var(--ti-mobile-error)', textColor: 'white', border: 'none', iconFilter: 'brightness(0) invert(1)', handler: startTranslation }
  }

  if (pageTranslationData.value.isTranslating || pageTranslationData.value.isAutoTranslating) {
    const isInitialPass = pageTranslationData.value.isTranslating;
    return {
      label: isInitialPass ? (t('mobile_page_stop_btn') || 'Stop Translation') : (t('mobile_page_stop_auto_btn') || 'Stop Auto-Translation'),
      icon: isInitialPass ? closeIcon : eyeHideIcon,
      bgColor: 'var(--ti-mobile-warning-bg)',
      textColor: 'var(--ti-mobile-warning)',
      border: '1px solid var(--ti-mobile-warning-bg)',
      iconFilter: isInitialPass ? 'invert(38%) sepia(88%) saturate(1212%) hue-rotate(335deg) brightness(98%) contrast(98%)' : 'invert(36%) sepia(84%) saturate(1212%) hue-rotate(351deg) brightness(91%) contrast(92%)',
      handler: stopAutoTranslation
    }
  }

  if (pageTranslationData.value.isTranslated) {
    return { label: t('mobile_page_restore_btn') || 'Restore Original Page', icon: restoreIcon, bgColor: 'var(--ti-mobile-card-bg)', textColor: 'var(--ti-mobile-text-secondary)', border: '1px solid var(--ti-mobile-border)', iconFilter: 'var(--ti-mobile-icon-filter)', handler: restorePage }
  }

  return { label: t('mobile_page_start_btn') || 'Start Translation', icon: wholePageIcon, bgColor: 'var(--ti-mobile-accent)', textColor: 'white', border: 'none', iconFilter: 'brightness(0) invert(1)', handler: startTranslation }
})

const goToDashboard = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) }
const closeView = () => { mobileStore.closeSheet() }
const startTranslation = () => { pageEventBus.emit(MessageActions.PAGE_TRANSLATE); mobileStore.closeSheet() }
const stopAutoTranslation = () => { pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO) }
const restorePage = () => { pageEventBus.emit(MessageActions.PAGE_RESTORE) }
</script>

<style scoped>
.ti-m-status-dot { background: var(--ti-mobile-text-muted) !important; }
.ti-m-status-dot.translating { background: var(--ti-mobile-accent) !important; box-shadow: 0 0 0 3px var(--ti-mobile-accent-bg) !important; animation: pulse-mobile 1.5s infinite !important; }
.ti-m-status-dot.completed { background: var(--ti-mobile-success) !important; box-shadow: 0 0 0 3px rgba(81, 207, 102, 0.2) !important; }
.ti-m-status-dot.error { background: var(--ti-mobile-error) !important; }

.ti-m-icon-img-close {
  filter: var(--ti-mobile-icon-filter) !important;
}

@keyframes pulse-mobile { 0% { transform: scale(0.95); opacity: 1; } 50% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(0.95); opacity: 1; } }
@keyframes indeterminate-mobile { 0% { transform: translateX(-100%) scaleX(0.2); } 50% { transform: translateX(0%) scaleX(0.5); } 100% { transform: translateX(100%) scaleX(0.2); } }
.ti-m-progress-bar-fill.indeterminate { animation: indeterminate-mobile 2s infinite linear !important; transform-origin: 0% 50% !important; }
button:active { transform: scale(0.98) !important; opacity: 0.8 !important; }
</style>