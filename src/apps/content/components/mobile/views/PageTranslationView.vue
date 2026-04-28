<template>
  <div
    class="ti-m-page-translation-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
  >
    <!-- Header -->
    <div class="ti-m-view-header">
      <div class="ti-m-header-left-section">
        <button
          class="ti-m-back-btn"
          @click="goToDashboard"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 6 4"
            fill="none"
          >
            <path
              d="M1 1L3 3L5 1"
              stroke="currentColor"
              stroke-width="0.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
        
        <!-- Status Info (Icon Only) -->
        <div
          class="ti-m-header-status-row"
          @click="goToDashboard"
        >
          <PageTranslationStatus 
            mode="mobile-header"
          />
        </div>
      </div>
      
      <!-- Primary Action Pill (Centered) -->
      <button 
        class="ti-m-header-primary-btn notranslate"
        translate="no"
        :data-status="pageTranslationData.status === 'error' ? 'error' : (pageTranslationData.isTranslating || pageTranslationData.isAutoTranslating ? 'translating' : (pageTranslationData.isTranslated ? 'translated' : 'ready'))"
        @click.stop="primaryAction.handler"
      >
        <img 
          :src="primaryAction.icon" 
        >
        {{ primaryAction.label }}
      </button>

      <div class="ti-m-header-actions">
        <button
          class="ti-m-close-btn"
          @click="closeView"
        >
          <img
            src="@/icons/ui/close.png"
            :alt="t('mobile_close_button_alt') || 'Close'"
            class="ti-m-icon-img-close"
          >
        </button>
      </div>
    </div>

    <!-- Progress Card -->
    <div 
      class="ti-m-progress-card notranslate"
      translate="no"
      :class="{ 'has-error': pageTranslationData.status === 'error' }"
    >
      <div class="ti-m-progress-label-row">
        <div class="ti-m-progress-info">
          <span class="ti-m-progress-subtitle">
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_error_encountered') || 'Error Encountered') : (t('mobile_page_translation_progress') || 'Translation Progress') }}
          </span>
          <span class="ti-m-progress-value">
            {{ pageTranslationData.status === 'error' ? (t('mobile_page_failed_status') || 'Failed') : computedProgress + '%' }}
          </span>
        </div>
        <div 
          v-if="pageTranslationData.status !== 'error'"
          class="ti-m-progress-counter"
        >
          {{ pageTranslationData.translatedCount }} / {{ pageTranslationData.totalCount || '?' }}
        </div>
      </div>

      <!-- Error Message in Progress Card -->
      <div
        v-if="pageTranslationData.status === 'error'"
        class="ti-m-error-message"
      >
        {{ pageTranslationData.errorMessage || (t('mobile_page_unknown_error') || 'Unknown translation error') }}
      </div>

      <div class="ti-m-progress-bar-container">
        <div 
          class="ti-m-progress-bar-fill" 
          :class="{ 'indeterminate': pageTranslationData.totalCount === 0 && pageTranslationData.isTranslating }"
          :style="{ '--progress-width': pageTranslationData.status === 'error' ? '100%' : `${computedProgress}%` }"
        />
      </div>

      <!-- Settings Row (Auto Close) -->
      <div class="ti-m-progress-settings-row">
        <div class="ti-m-setting-info">
          <span class="ti-m-setting-label">{{ t('mobile_page_auto_close_label') || 'Auto Close' }}</span>
          <span class="ti-m-setting-desc">{{ t('mobile_page_auto_close_tooltip') || 'Close after starting' }}</span>
        </div>
        <button 
          class="ti-m-setting-toggle-btn"
          :class="{ 'is-active': settingsStore.settings.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE }"
          @click="toggleAutoClose"
        >
          <div class="ti-m-toggle-thumb" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import './PageTranslationView.scss'
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { pageEventBus } from '@/core/PageEventBus.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import PageTranslationStatus from '@/components/shared/PageTranslationStatus.vue'

import wholePageIcon from '@/icons/ui/whole-page.png';
import closeIcon from '@/icons/ui/close.png';
import eyeHideIcon from '@/icons/ui/eye-hide.svg';
import restoreIcon from '@/icons/ui/restore.png';

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { pageTranslationData } = storeToRefs(mobileStore)
const { t } = useUnifiedI18n()
const logger = getScopedLogger(LOG_COMPONENTS.MOBILE, 'PageTranslationView')

const computedProgress = computed(() => {
  if (pageTranslationData.value.status === 'error') return 0;
  if (pageTranslationData.value.status === 'completed') return 100;
  if (!pageTranslationData.value.totalCount || pageTranslationData.value.totalCount === 0) return 0;
  return Math.round((pageTranslationData.value.translatedCount / pageTranslationData.value.totalCount) * 100);
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

const goToDashboard = () => { 
  if (pageTranslationData.value.status === 'error') {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_RESET_ERROR);
  }
  mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.DASHBOARD) 
}

const closeView = () => { 
  if (pageTranslationData.value.status === 'error') {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_RESET_ERROR);
  }
  mobileStore.closeSheet() 
}

const toggleAutoClose = async () => {
  const currentValue = settingsStore.settings.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE || false
  try {
    await settingsStore.updateSettingAndPersist('MOBILE_PAGE_TRANSLATION_AUTO_CLOSE', !currentValue)
  } catch (err) {
    logger.error('Failed to save auto-close setting:', err)
  }
}

const startTranslation = () => { 
  logger.info('Starting page translation from Mobile View');
  
  // Reset error state before retrying
  if (pageTranslationData.value.status === 'error') {
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE_RESET_ERROR);
  }

  pageEventBus.emit(MessageActions.PAGE_TRANSLATE); 
  if (settingsStore.settings.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE) {
    mobileStore.closeSheet() 
  }
}

const stopAutoTranslation = () => { 
  logger.info('Stopping auto-translation from Mobile View');
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE_STOP_AUTO) 
}
const restorePage = () => { 
  logger.info('Restoring original page from Mobile View');
  pageEventBus.emit(MessageActions.PAGE_RESTORE) 
}
</script>
