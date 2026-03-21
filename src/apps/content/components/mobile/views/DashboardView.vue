<template>
  <div class="dashboard-view" style="display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 0;">
    <div class="dashboard-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; width: 100%; max-width: 100%; margin: 0 auto; justify-items: center; padding: 10px 0;">
      <!-- Translate Page Button -->
      <button class="action-card" @click="translatePage">
        <div class="icon-container translate-page">
          <img src="@/icons/ui/whole-page.png" alt="Translate Page" style="width: 24px !important; height: 24px !important; object-fit: contain !important;" />
        </div>
        <span class="action-label">Page</span>
      </button>

      <!-- Select Element Button -->
      <button class="action-card" @click="activateSelectElement">
        <div class="icon-container select-element">
          <img src="@/icons/ui/select.png" alt="Select Element" style="width: 24px !important; height: 24px !important; object-fit: contain !important;" />
        </div>
        <span class="action-label">Select</span>
      </button>

      <!-- Manual Translation Button -->
      <button class="action-card" @click="goToInputView">
        <div class="icon-container manual-input">
          <img src="@/icons/ui/translate.png" alt="Manual Translation" style="width: 24px !important; height: 24px !important; object-fit: contain !important;" />
        </div>
        <span class="action-label">Input</span>
      </button>

      <!-- Settings Button -->
      <button class="action-card" @click="openSettings">
        <div class="icon-container settings">
          <img src="@/icons/ui/settings.png" alt="Settings" style="width: 24px !important; height: 24px !important; object-fit: contain !important;" />
        </div>
        <span class="action-label">Settings</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { useMobileStore } from '@/store/modules/mobile.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js'
import { MOBILE_CONSTANTS } from '@/shared/config/constants.js'

const mobileStore = useMobileStore()
const pageEventBus = window.pageEventBus

const translatePage = (event) => {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  
  // Set view so it's ready when user re-opens the sheet
  mobileStore.setView(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION)
  
  // Close sheet so user can see the translation on the actual page
  mobileStore.closeSheet()
  
  // Trigger translation
  pageEventBus.emit(MessageActions.PAGE_TRANSLATE)
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
</script>

<style>
.action-card { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: center; 
  background: #f8f9fa; 
  border: 1px solid #e9ecef; 
  border-radius: 12px; 
  padding: 12px 4px; 
  cursor: pointer; 
  transition: all 0.2s ease; 
  outline: none; 
  -webkit-tap-highlight-color: transparent; 
  width: 100%;
}
.action-card:active { background: #e9ecef; transform: scale(0.96); }
.icon-container { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 8px; }
.icon-container img { width: 24px; height: 24px; object-fit: contain; }
.translate-page { background: #e7f5ff; }
.select-element { background: #f3f0ff; }
.manual-input { background: #ebfbee; }
.settings { background: #fff4e6; }
.action-label { font-size: 11px; font-weight: 700; color: #495057; text-align: center; white-space: nowrap; }

@media (prefers-color-scheme: dark) {
  .action-card { background: #2d2d2d !important; border-color: #444 !important; }
  .action-label { color: #e0e0e0 !important; }
  .translate-page { background: #1864ab22; }
  .select-element { background: #5f3dc422; }
  .manual-input { background: #2b8a3e22; }
  .settings { background: #d9480f22; }
}
</style>
