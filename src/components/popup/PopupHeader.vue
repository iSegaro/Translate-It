<template>
  <div class="header-toolbar">
    <div class="toolbar-left-group">
      <a
        id="translatePageLink"
        class="toolbar-link"
        :title="$i18n('popup_translate_page_link_title') || 'ترجمه این صفحه در تب جدید'"
        @click="handleTranslatePage"
      >
        {{ $i18n('popup_translate_page_link') || 'ترجمه این صفحه' }}
      </a>
    </div>
    <div class="toolbar-right-group">
      <IconButton
        icon="side-panel.png"
        :title="$i18n('popup_open_side_panel_title') || 'باز کردن در پنل کناری'"
        type="toolbar"
        @click="handleOpenSidePanel"
      />
      <IconButton
        icon="select.png"
        :alt="$i18n('popup_select_element_alt_icon') || 'Select Element'"
        :title="$i18n('popup_select_element_title_icon') || 'حالت انتخاب با موس'"
        type="toolbar"
        :class="{ active: isSelectModeActive }"
        @click="handleSelectElement"
      />
      <IconButton
        icon="clear.png"
        :title="$i18n('popup_clear_storage_title_icon') || 'پاک کردن فیلدها'"
        :alt="$i18n('popup_clear_storage_alt_icon') || 'Clear Fields'"
        type="toolbar"
        @click="handleClearStorage"
      />
      <IconButton
        icon="revert.png"
        :alt="$i18n('popup_revert_alt_icon') || 'Revert'"
        :title="$i18n('popup_revert_title_icon') || 'بازگرداندن به حالت قبلی'"
        type="toolbar"
        variant="revert"
        @click="handleRevert"
      />
      <IconButton
        icon="settings.png"
        :alt="$i18n('popup_settings_alt_icon') || 'Settings'"
        :title="$i18n('popup_settings_title_icon') || 'تنظیمات'"
        type="toolbar"
        @click="handleOpenSettings"
      />
      <label
        class="switch"
        :title="$i18n('popup_exclude_toggle_title') || 'فعال/غیرفعال در این صفحه'"
      >
        <input 
          v-model="excludeCurrentPage" 
          type="checkbox"
          @change="handleExcludeToggle"
        >
        <span class="slider round" />
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useSelectElementTranslation } from '@/composables/useTranslationModes.js'
import { useMessaging } from '@/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/useErrorHandler.js'
import browser from 'webextension-polyfill'
import IconButton from '@/components/shared/IconButton.vue'
import { MessageActions } from '@/messaging/core/MessageActions.js'
import { MessageContexts } from '../../messaging/core/MessagingCore.js'
import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = createLogger(LOG_COMPONENTS.UI, 'PopupHeader');

// Stores
const settingsStore = useSettingsStore()

// Composables
const {
  isSelectModeActive,
  toggleSelectElement,
  error: selectElementError
} = useSelectElementTranslation()
const { handleError, handleConnectionError } = useErrorHandler()
const { sendMessage } = useMessaging('popup')

// State
const excludeCurrentPage = ref(false)

// Methods
const handleTranslatePage = async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    if (activeTab) {
      const googleTranslateUrl = `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(settingsStore.settings.TARGET_LANGUAGE)}&u=${encodeURIComponent(activeTab.url)}`
      await browser.tabs.create({ url: googleTranslateUrl })
      window.close()
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-translatePage')
  }
}

const handleOpenSidePanel = async () => {
  try {
    // Get the current tab information to provide context
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    logger.debug('[PopupHeader] Opening side panel for tab:', activeTab?.id)
    
    await sendMessage({ 
      action: MessageActions.OPEN_SIDE_PANEL,
      data: {
        tabId: activeTab?.id,
        windowId: activeTab?.windowId
      }
    })
    
    logger.debug('[PopupHeader] Side panel open request sent successfully')
    window.close()
  } catch (error) {
    await handleError(error, 'PopupHeader-sidePanel')
  }
}

const handleSelectElement = async () => {
  try {
    logger.debug('[PopupHeader] Select element button clicked')
    await toggleSelectElement()
    logger.debug('[PopupHeader] Select element mode toggled successfully')
    window.close()
  } catch (error) {
    await handleError(error, 'PopupHeader-selectElement')
  }
}

const handleClearStorage = () => {
  const event = new CustomEvent('clear-storage')
  document.dispatchEvent(event)
}

const handleRevert = async () => {
  try {
    logger.debug('[PopupHeader] Executing revert action')
    
    // Send revert message directly to content script (bypass background)
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) {
      throw new Error('No active tab found')
    }
    
    const response = await browser.tabs.sendMessage(tab.id, {
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: MessageContexts.POPUP,
      messageId: `popup-revert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now()
    })
    
    if (response?.success) {
      logger.debug(`[PopupHeader] ✅ Revert successful: ${response.revertedCount || 0} translations reverted`)
    } else {
      const errorMsg = response?.error || response?.message || 'Unknown error'
      await handleError(new Error(`Revert failed: ${errorMsg}`), 'popup-header-revert-failed')
    }
    
  } catch (error) {
    // Check if it's a connection error first
    const wasConnectionError = await handleConnectionError(error, 'PopupHeader-revert')
    if (wasConnectionError) {
      return // Exit gracefully
    }
    
    // Handle other errors
    await handleError(error, 'PopupHeader-revert')
  }
}

const handleOpenSettings = async () => {
  try {
    await browser.runtime.openOptionsPage()
    window.close()
  } catch (error) {
    await handleError(error, 'PopupHeader-openSettings')
  }
}

const handleExcludeToggle = async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    if (activeTab) {
      await sendMessage({
        action: MessageActions.Set_Exclude_Current_Page,
        data: {
          exclude: excludeCurrentPage.value,
          url: activeTab.url,
        },
      })
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-excludeToggle')
  }
}

// Initialize exclude status
onMounted(async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    if (activeTab) {
      const response = await sendMessage({
        action: MessageActions.IS_Current_Page_Excluded,
        data: { url: activeTab.url },
      })
      excludeCurrentPage.value = response?.excluded || false
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-getExcludeStatus')
  }
});
</script>

<style scoped>
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--header-border-color);
  flex-direction: row;
}

.toolbar-right-group {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toolbar-left-group {
  display: flex;
  gap: 8px;
}

/* Left group (Translate link) should stay on the left side */
.toolbar-left-group {
  display: flex;
  align-items: center;
  gap: 8px;
  order: 1;
}

/* Right group (icon buttons + switch) should stay on the right side */
.toolbar-right-group {
  display: flex;
  align-items: center;
  gap: 8px;
  order: 2;
}


.toolbar-icon {
  width: 20px;
  height: 20px;
  cursor: pointer;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
  filter: var(--icon-filter);
}

.toolbar-icon:hover {
  opacity: var(--icon-hover-opacity);
}

.revert-icon {
  transition: transform 0.4s ease, opacity 0.2s ease-in-out, filter 0.2s ease-in-out;
}

.revert-icon:hover {
  transform: rotate(360deg);
}

.toolbar-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--toolbar-link-color);
  text-decoration: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  opacity: var(--icon-opacity);
  transition: opacity 0.2s ease-in-out, background-color 0.2s ease-in-out;
  background-color: transparent;
}

.toolbar-link:hover {
  opacity: var(--icon-hover-opacity);
  background-color: var(--toolbar-link-hover-bg-color);
}

/* Toggle Switch Styles */
.switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 20px;
  margin-left: 8px;
  vertical-align: middle;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #ccc;
  transition: 0.2s;
  border-radius: 20px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 16px;
  width: 16px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #4caf50;
}

input:focus + .slider {
  box-shadow: 0 0 1px #4caf50;
}

input:checked + .slider:before {
  transform: translateX(20px);
}
</style>