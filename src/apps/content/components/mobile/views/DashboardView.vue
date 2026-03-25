<template>
  <div class="dashboard-view" style="width: 100% !important; margin: 0 !important; padding: 0 !important; background: transparent !important; display: block !important;">
    <div class="dashboard-scroll-container" style="display: flex !important; flex-flow: row wrap !important; align-items: center !important; justify-content: center !important; width: 100% !important; padding: 12px 10px !important; gap: 8px 4px !important; box-sizing: border-box !important;">
      
      <!-- Translate Page Button -->
      <button class="action-btn" @click="translatePage" :style="btnStyle">
        <div class="icon-container translate-page" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(24, 100, 171, 0.25) !important' : '#e7f5ff !important' }]">
          <img :src="wholePageIcon" :alt="t('mobile_dashboard_page_label') || 'Page'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_page_label') || 'Page' }}</span>
      </button>

      <!-- Select Element Button -->
      <button class="action-btn" @click="activateSelectElement" :style="btnStyle">
        <div class="icon-container select-element" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(151, 119, 250, 0.4) !important' : '#f3f0ff !important' }]">
          <img :src="selectIcon" :alt="t('mobile_dashboard_select_label') || 'Select'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_select_label') || 'Select' }}</span>
      </button>

      <!-- Manual Translation Button -->
      <button class="action-btn" @click="goToInputView" :style="btnStyle">
        <div class="icon-container manual-input" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(43, 138, 62, 0.4) !important' : '#ebfbee !important' }]">
          <img :src="translateIcon" :alt="t('mobile_dashboard_input_label') || 'Input'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_input_label') || 'Input' }}</span>
      </button>

      <!-- History Button -->
      <button class="action-btn" @click="goToHistoryView" :style="btnStyle">
        <div class="icon-container history" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(252, 196, 25, 0.4) !important' : '#fff9db !important' }]">
          <img :src="historyIcon" :alt="t('mobile_dashboard_history_label') || 'History'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_history_label') || 'History' }}</span>
      </button>

      <!-- Settings Button -->
      <button class="action-btn" @click="openSettings" :style="btnStyle">
        <div class="icon-container settings" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(255, 146, 43, 0.4) !important' : '#fff4e6 !important' }]">
          <img :src="settingsIcon" :alt="t('mobile_dashboard_settings_label') || 'Settings'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_settings_label') || 'Settings' }}</span>
      </button>

      <!-- Revert Element Translations (Dynamic) -->
      <button v-if="hasElementTranslations" class="action-btn revert-btn" @click="revertTranslations" :style="btnStyle">
        <div class="icon-container revert" :style="[iconContainerStyle, { background: settingsStore.isDarkTheme ? 'rgba(255, 107, 107, 0.4) !important' : '#fff5f5 !important' }]">
          <img :src="revertIcon" :alt="t('mobile_dashboard_revert_label') || 'Revert'" :style="[iconImageStyle, { filter: settingsStore.isDarkTheme ? 'brightness(0) invert(1) !important' : 'none !important' }]" width="24" height="24" />
        </div>
        <span class="action-label" :style="[labelStyle, { color: settingsStore.isDarkTheme ? '#e0e0e0 !important' : '#495057 !important' }]">{{ t('mobile_dashboard_revert_label') || 'Revert' }}</span>
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
import { useResourceTracker } from '@/composables/core/useResourceTracker'

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
const tracker = useResourceTracker('mobile-dashboard')

const btnStyle = {
  display: 'flex !important',
  flexDirection: 'column !important',
  alignItems: 'center !important',
  justifyContent: 'center !important',
  background: 'transparent !important',
  border: 'none !important',
  padding: '4px 0 !important',
  cursor: 'pointer !important',
  outline: 'none !important',
  minWidth: '70px !important',
  maxWidth: '70px !important',
  flex: '0 0 70px !important',
  boxSizing: 'border-box !important',
  WebkitTapHighlightColor: 'transparent !important'
};

const iconContainerStyle = {
  width: '40px !important',
  height: '40px !important',
  borderRadius: '12px !important',
  display: 'flex !important',
  alignItems: 'center !important',
  justifyContent: 'center !important',
  marginBottom: '2px !important',
  flexShrink: '0 !important',
  transition: 'transform 0.1s ease !important'
};

const iconImageStyle = {
  width: '24px !important',
  height: '24px !important',
  minWidth: '24px !important',
  minHeight: '24px !important',
  maxWidth: '24px !important',
  maxHeight: '24px !important',
  objectFit: 'contain !important',
  display: 'block !important'
};

const labelStyle = {
  fontSize: '11px !important',
  fontWeight: '600 !important',
  textAlign: 'center !important',
  whiteSpace: 'nowrap !important',
  width: '100% !important'
};

const translatePage = (event) => {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  const isCurrentlyTranslating = mobileStore.pageTranslationData.isTranslating || mobileStore.pageTranslationData.isAutoTranslating || mobileStore.pageTranslationData.isTranslated;
  if (isCurrentlyTranslating) mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION)
  else { pageEventBus.emit(MessageActions.PAGE_TRANSLATE); mobileStore.closeSheet() }
}

const activateSelectElement = () => { mobileStore.closeSheet(); pageEventBus.emit(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) }
const goToInputView = () => { mobileStore.resetSelectionData(); mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.INPUT) }
const goToHistoryView = () => { mobileStore.navigate(MOBILE_CONSTANTS.VIEWS.HISTORY) }
const openSettings = () => { pageEventBus.emit(WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS) }
const revertTranslations = () => { pageEventBus.emit('revert-translations') }
</script>

<style scoped>
.dashboard-scroll-container::-webkit-scrollbar { display: none !important; }
.dashboard-scroll-container { scrollbar-width: none !important; -ms-overflow-style: none !important; }
.action-btn:active .icon-container { transform: scale(0.92) !important; filter: brightness(0.9) !important; }
</style>