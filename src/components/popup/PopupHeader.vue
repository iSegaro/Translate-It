<template>
  <div class="header-toolbar">
    <div class="toolbar-left-group">
      <a
        id="translatePageLink"
        @click="handleTranslatePage"
        class="toolbar-link"
        :title="$i18n('popup_translate_page_link_title') || 'ترجمه این صفحه در تب جدید'"
      >
        {{ $i18n('popup_translate_page_link') || 'ترجمه این صفحه' }}
      </a>
    </div>
    <div class="toolbar-right-group">
      <IconButton
        icon="side-panel.png"
        @click="handleOpenSidePanel"
        :title="$i18n('popup_open_side_panel_title') || 'باز کردن در پنل کناری'"
        type="toolbar"
      />
      <IconButton
        icon="select.png"
        @click="handleSelectElement"
        :alt="$i18n('popup_select_element_alt_icon') || 'Select Element'"
        :title="$i18n('popup_select_element_title_icon') || 'حالت انتخاب با موس'"
        type="toolbar"
        :class="{ active: isSelectModeActive }"
      />
      <IconButton
        icon="clear.png"
        @click="handleClearStorage"
        :title="$i18n('popup_clear_storage_title_icon') || 'پاک کردن فیلدها'"
        :alt="$i18n('popup_clear_storage_alt_icon') || 'Clear Fields'"
        type="toolbar"
      />
      <IconButton
        icon="revert.png"
        @click="handleRevert"
        :alt="$i18n('popup_revert_alt_icon') || 'Revert'"
        :title="$i18n('popup_revert_title_icon') || 'بازگرداندن به حالت قبلی'"
        type="toolbar"
        variant="revert"
      />
      <IconButton
        icon="settings.png"
        @click="handleOpenSettings"
        :alt="$i18n('popup_settings_alt_icon') || 'Settings'"
        :title="$i18n('popup_settings_title_icon') || 'تنظیمات'"
        type="toolbar"
      />
      <label
        class="switch"
        :title="$i18n('popup_exclude_toggle_title') || 'فعال/غیرفعال در این صفحه'"
      >
        <input 
          type="checkbox" 
          v-model="excludeCurrentPage"
          @change="handleExcludeToggle"
        />
        <span class="slider round"></span>
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useSettingsStore } from '@/store/core/settings'
import { useSelectElementTranslation } from '@/composables/useSelectElementTranslation.js'
import browser from 'webextension-polyfill'
import IconButton from '@/components/shared/IconButton.vue'

// Stores
const settingsStore = useSettingsStore()

// Composables
const {
  isSelectModeActive,
  toggleSelectElement,
  error: selectElementError
} = useSelectElementTranslation()

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
    console.error('Error opening translate page:', error)
  }
}

const handleOpenSidePanel = async () => {
  try {
    
    // For Chrome, find the current tab and open its side panel
    if (browser.sidePanel) {
      const [activeTab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      })
      if (activeTab) {
        await browser.sidePanel.open({ tabId: activeTab.id })
      }
    }
    // For Firefox, just open the sidebar
    else if (browser.sidebarAction) {
      await browser.sidebarAction.open()
    }

    // Close the popup after the action is initiated
    window.close()
  } catch (error) {
    console.error('Error opening side panel from popup:', error)
  }
}

const handleSelectElement = async () => {
  try {
    console.log('[PopupHeader] Select element button clicked')
    
    // Use Vue composable instead of direct message
    await toggleSelectElement()
    
    console.log('[PopupHeader] Select element mode toggled successfully')
    
    // Close popup after activation
    window.close()
  } catch (error) {
    console.error('[PopupHeader] Error toggling select element mode:', error)
    
    // Show error if composable provides it
    if (selectElementError.value) {
      console.error('[PopupHeader] Select element error:', selectElementError.value)
    }
  }
}

const handleClearStorage = () => {
  // Emit event to clear translation form
  // This will be handled by parent component
  const event = new CustomEvent('clear-storage')
  document.dispatchEvent(event)
}

const handleRevert = () => {
  // Emit event to revert translation
  // This will be handled by parent component
  const event = new CustomEvent('revert-translation')
  document.dispatchEvent(event)
}

const handleOpenSettings = async () => {
  try {
    await browser.runtime.openOptionsPage()
    window.close()
  } catch (error) {
    console.error('Error opening settings:', error)
  }
}

const handleExcludeToggle = async () => {
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    if (activeTab) {
      await browser.runtime.sendMessage({
        action: "setExcludeCurrentPage",
        data: {
          exclude: excludeCurrentPage.value,
          url: activeTab.url,
        },
      })
    }
  } catch (error) {
    console.error('Error toggling exclude status:', error)
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
      const response = await browser.runtime.sendMessage({
        action: "isCurrentPageExcluded",
        data: { url: activeTab.url },
      })
      excludeCurrentPage.value = response?.excluded || false
    }
  } catch (error) {
    console.error('Error getting exclude status:', error)
  }
})
</script>

<style scoped>
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--header-border-color);
  flex-direction: row-reverse;
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