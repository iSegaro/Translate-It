<template>
  <div
    class="ti-m-dashboard-view"
    :class="{ 'is-dark': settingsStore.isDarkTheme }"
    style="width: 100% !important; margin: 0 !important; padding: 0 !important; display: block !important; background: transparent !important;"
  >
    <div
      class="ti-m-dashboard-scroll-container"
      style="display: flex; flex-flow: row nowrap; align-items: center; justify-content: center; width: 100%; padding: 12px 15px; gap: 8px; box-sizing: border-box; overflow-x: auto; -webkit-overflow-scrolling: touch; touch-action: pan-x;"
    >
      <!-- Translate Page Button -->
      <button
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="translatePage"
      >
        <div
          class="ti-m-icon-container ti-m-icon-translate-page"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="wholePageIcon"
            :alt="t('mobile_dashboard_page_label') || 'Page'"
            class="ti-toolbar-icon"
            style="width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important;"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_page_label') || 'Page' }}</span>
      </button>

      <!-- Select Element Button -->
      <button
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="activateSelectElement"
      >
        <div
          class="ti-m-icon-container ti-m-icon-select-element"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="selectIcon"
            :alt="t('mobile_dashboard_select_label') || 'Select'"
            class="ti-toolbar-icon"
            :style="'width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important; ' + (settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : '')"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_select_label') || 'Select' }}</span>
      </button>

      <!-- Manual Translation Button -->
      <button
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="goToInputView"
      >
        <div
          class="ti-m-icon-container ti-m-icon-manual-input"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="translateIcon"
            :alt="t('mobile_dashboard_input_label') || 'Input'"
            class="ti-toolbar-icon"
            style="width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important;"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_input_label') || 'Input' }}</span>
      </button>

      <!-- History Button -->
      <button
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="goToHistoryView"
      >
        <div
          class="ti-m-icon-container ti-m-icon-history"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="historyIcon"
            :alt="t('mobile_dashboard_history_label') || 'History'"
            class="ti-toolbar-icon"
            :style="'width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important; ' + (settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : '')"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_history_label') || 'History' }}</span>
      </button>

      <!-- Settings Button -->
      <button
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="openSettings"
      >
        <div
          class="ti-m-icon-container ti-m-icon-settings"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="settingsIcon"
            :alt="t('mobile_dashboard_settings_label') || 'Settings'"
            class="ti-toolbar-icon"
            :style="'width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important; ' + (settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : '')"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_settings_label') || 'Settings' }}</span>
      </button>

      <!-- Revert Element Translations (Dynamic) -->
      <button
        v-if="hasElementTranslations"
        class="ti-m-action-btn"
        style="display: flex !important; flex-direction: column !important; align-items: center !important; justify-content: center !important; background: transparent !important; border: none !important; padding: 4px 0 !important; cursor: pointer !important; outline: none !important; min-width: 70px !important; max-width: 70px !important; flex: 0 0 70px !important; box-sizing: border-box !important; -webkit-tap-highlight-color: transparent !important;"
        @click="revertTranslations"
      >
        <div
          class="ti-m-icon-container ti-m-icon-revert"
          style="width: 40px !important; height: 40px !important; border-radius: 12px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 2px !important; flex-shrink: 0 !important; transition: transform 0.1s ease !important;"
        >
          <img
            :src="revertIcon"
            :alt="t('mobile_dashboard_revert_label') || 'Revert'"
            class="ti-toolbar-icon"
            :style="'width: 24px !important; height: 24px !important; min-width: 24px !important; min-height: 24px !important; max-width: 24px !important; max-height: 24px !important; object-fit: contain !important; display: block !important; ' + (settingsStore.isDarkTheme ? 'filter: brightness(0) invert(1) !important;' : '')"
          >
        </div>
        <span
          class="ti-m-action-label"
          style="font-size: 11px !important; font-weight: 600 !important; text-align: center !important; white-space: nowrap !important; width: 100% !important; color: var(--ti-mobile-text) !important;"
        >{{ t('mobile_dashboard_revert_label') || 'Revert' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useI18n } from '@/composables/shared/useI18n.js'
import { useMobileStore } from '@/store/modules/mobile.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

import wholePageIcon from '@/icons/ui/whole-page.png';
import selectIcon from '@/icons/ui/select.png';
import translateIcon from '@/icons/ui/translate.png';
import settingsIcon from '@/icons/ui/settings.png';
import revertIcon from '@/icons/ui/revert.png';
import historyIcon from '@/icons/ui/history.svg';

const mobileStore = useMobileStore()
const settingsStore = useSettingsStore()
const { hasElementTranslations } = storeToRefs(mobileStore)
const { t } = useI18n()
const pageEventBus = window.pageEventBus

const translatePage = (event) => {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const isCurrentlyTranslating = mobileStore.pageTranslationData.isTranslating || mobileStore.pageTranslationData.isAutoTranslating || mobileStore.pageTranslationData.isTranslated;
  if (isCurrentlyTranslating) mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION)
  else { 
    pageEventBus.emit(MessageActions.PAGE_TRANSLATE); 
    mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION);
    
    // Respect the auto-close setting
    if (settingsStore.settings.MOBILE_PAGE_TRANSLATION_AUTO_CLOSE) {
      mobileStore.closeSheet();
    }
  }
}

const activateSelectElement = () => { mobileStore.closeSheet(); pageEventBus.emit(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) }
const goToInputView = () => { mobileStore.resetSelectionData(); mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT) }
const goToHistoryView = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.HISTORY) }
const openSettings = () => { pageEventBus.emit(WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS) }
const revertTranslations = () => { pageEventBus.emit('revert-translations') }
</script>

<style scoped>
.ti-m-dashboard-scroll-container::-webkit-scrollbar { display: none !important; }
.ti-m-dashboard-scroll-container { scrollbar-width: none !important; -ms-overflow-style: none !important; }

/* Dashboard Icon Filtering (Like Popup) */
.ti-toolbar-icon {
  filter: none !important;
}

.is-dark .ti-toolbar-icon {
  filter: var(--ti-mobile-icon-filter) !important;
}

.ti-m-action-label {
  color: var(--ti-mobile-text) !important;
}

/* Specific Icon Colors with Dark Mode Overrides */
.ti-m-icon-translate-page { background: #e7f5ff !important; }
.is-dark .ti-m-icon-translate-page { background: rgba(24, 100, 171, 0.25) !important; }

.ti-m-icon-select-element { background: #f3f0ff !important; }
.is-dark .ti-m-icon-select-element { background: rgba(151, 119, 250, 0.4) !important; }

.ti-m-icon-manual-input { background: #ebfbee !important; }
.is-dark .ti-m-icon-manual-input { background: rgba(43, 138, 62, 0.4) !important; }

.ti-m-icon-history { background: #fff9db !important; }
.is-dark .ti-m-icon-history { background: rgba(252, 196, 25, 0.4) !important; }

.ti-m-icon-settings { background: #fff4e6 !important; }
.is-dark .ti-m-icon-settings { background: rgba(255, 146, 43, 0.4) !important; }

.ti-m-icon-revert { background: #fff5f5 !important; }
.is-dark .ti-m-icon-revert { background: rgba(255, 107, 107, 0.4) !important; }
</style>