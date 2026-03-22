<template>
  <div class="dashboard-view notranslate" translate="no" style="width: 100% !important; margin: 0 !important; padding: 0 !important; background: transparent !important; display: block !important; overflow: hidden !important;">
    <div class="dashboard-scroll-container" style="display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: center !important; overflow-x: auto !important; overflow-y: hidden !important; width: 100% !important; padding: 15px 10px !important; gap: 8px !important; box-sizing: border-box !important; -webkit-overflow-scrolling: touch !important;">
      
      <!-- Translate Page Button -->
      <button class="action-btn" @click="translatePage" :style="btnStyle">
        <div class="icon-container translate-page" :style="[iconContainerStyle, { background: '#e7f5ff' }]">
          <img :src="wholePageIcon" alt="Page" :style="iconImageStyle" width="24" height="24" />
        </div>
        <span class="action-label" :style="labelStyle">Page</span>
      </button>

      <!-- Select Element Button -->
      <button class="action-btn" @click="activateSelectElement" :style="btnStyle">
        <div class="icon-container select-element" :style="[iconContainerStyle, { background: '#f3f0ff' }]">
          <img :src="selectIcon" alt="Select" :style="iconImageStyle" width="24" height="24" />
        </div>
        <span class="action-label" :style="labelStyle">Select</span>
      </button>

      <!-- Manual Translation Button -->
      <button class="action-btn" @click="goToInputView" :style="btnStyle">
        <div class="icon-container manual-input" :style="[iconContainerStyle, { background: '#ebfbee' }]">
          <img :src="translateIcon" alt="Input" :style="iconImageStyle" width="24" height="24" />
        </div>
        <span class="action-label" :style="labelStyle">Input</span>
      </button>

      <!-- Settings Button -->
      <button class="action-btn" @click="openSettings" :style="btnStyle">
        <div class="icon-container settings" :style="[iconContainerStyle, { background: '#fff4e6' }]">
          <img :src="settingsIcon" alt="Settings" :style="iconImageStyle" width="24" height="24" />
        </div>
        <span class="action-label" :style="labelStyle">Settings</span>
      </button>

      <!-- Revert Element Translations (Dynamic) -->
      <button v-if="hasElementTranslations" class="action-btn revert-btn" @click="revertTranslations" :style="btnStyle">
        <div class="icon-container revert" :style="[iconContainerStyle, { background: '#fff5f5' }]">
          <img :src="revertIcon" alt="Revert" :style="iconImageStyle" width="24" height="24" />
        </div>
        <span class="action-label" :style="labelStyle">Revert</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { storeToRefs } from 'pinia'
import { useMobileStore } from '@/store/modules/mobile.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

import wholePageIcon from '@/icons/ui/whole-page.png';
import selectIcon from '@/icons/ui/select.png';
import translateIcon from '@/icons/ui/translate.png';
import settingsIcon from '@/icons/ui/settings.png';
import revertIcon from '@/icons/ui/revert.png';

const mobileStore = useMobileStore()
const { hasElementTranslations } = storeToRefs(mobileStore)
const pageEventBus = window.pageEventBus

// NEW: Minimal Button Style (No card background/border)
const btnStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  padding: '8px 0',
  cursor: 'pointer',
  outline: 'none',
  minWidth: '72px',
  maxWidth: '72px',
  flex: '0 0 72px',
  boxSizing: 'border-box',
  WebkitTapHighlightColor: 'transparent'
};

const iconContainerStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: '4px',
  flexShrink: '0',
  transition: 'transform 0.1s ease'
};

const iconImageStyle = {
  width: '24px !important',
  height: '24px !important',
  minWidth: '24px !important',
  minHeight: '24px !important',
  maxWidth: '24px !important',
  maxHeight: '24px !important',
  objectFit: 'contain',
  display: 'block'
};

const labelStyle = {
  fontSize: '11px',
  fontWeight: '600',
  color: '#495057',
  textAlign: 'center',
  whiteSpace: 'nowrap',
  width: '100%'
};

const translatePage = (event) => {
  if (event) { event.preventDefault(); event.stopPropagation(); }
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION)
  mobileStore.closeSheet()
  setTimeout(() => { pageEventBus.emit(MessageActions.PAGE_TRANSLATE) }, 0)
}

const activateSelectElement = () => {
  mobileStore.closeSheet()
  pageEventBus.emit(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE)
}

const goToInputView = () => {
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.INPUT)
  mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.FULL)
}

const openSettings = () => {
  pageEventBus.emit(WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS)
}

const revertTranslations = () => {
  pageEventBus.emit('revert-translations')
}
</script>

<style scoped>
.dashboard-scroll-container::-webkit-scrollbar { display: none !important; }
.dashboard-scroll-container { scrollbar-width: none !important; -ms-overflow-style: none !important; }

/* Visual feedback on the icon container instead of the whole card */
.action-btn:active .icon-container { 
  transform: scale(0.92) !important;
  filter: brightness(0.9);
}

@media (prefers-color-scheme: dark) {
  .action-label { color: #e0e0e0 !important; }
  .translate-page { background-color: #1864ab33 !important; }
  .select-element { background-color: #5f3dc433 !important; }
  .manual-input { background-color: #2b8a3e33 !important; }
  .settings { background-color: #d9480f33 !important; }
  .revert { background-color: #c92a2a33 !important; }
}
</style>