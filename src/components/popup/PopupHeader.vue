<template>
  <div class="header-toolbar">
    <div class="toolbar-left-group">
      <PageTranslationButton
        v-if="isWholePageEnabled"
        text-only
        :target-language="targetLanguage"
      />
    </div>
    <div class="toolbar-right-group">
      <IconButton
        ref="sidePanelButton"
        icon="side-panel.png"
        :title="t('popup_open_side_panel_title') || 'باز کردن در پنل کناری'"
        type="toolbar"
      />
      <IconButton
        v-if="isSelectElementEnabled"
        icon="select.png"
        :alt="t('popup_select_element_alt_icon') || 'Select Element'"
        :title="t('popup_select_element_title_icon') || 'حالت انتخاب با موس'"
        type="toolbar"
        :active="isSelectModeActive"
        @click="handleSelectElement"
      />
      <IconButton
        icon="clear.png"
        :title="t('popup_clear_storage_title_icon') || 'پاک کردن فیلدها'"
        :alt="t('popup_clear_storage_alt_icon') || 'Clear Fields'"
        type="toolbar"
        @click="handleClearStorage"
      />
      <IconButton
        v-if="isSelectElementEnabled"
        icon="revert.png"
        :alt="t('popup_revert_alt_icon') || 'Revert'"
        :title="t('popup_revert_title_icon') || 'بازگرداندن به حالت قبلی'"
        type="toolbar"
        variant="revert"
        @click="handleRevert"
      />
      <IconButton
        icon="settings.png"
        :alt="t('popup_settings_alt_icon') || 'Settings'"
        :title="t('popup_settings_title_icon') || 'تنظیمات'"
        type="toolbar"
        @click="handleOpenSettings"
      />
      <label
        class="switch"
        :title="t('popup_exclude_toggle_title') || 'فعال/غیرفعال در این صفحه'"
      >
        <input 
          v-model="isExtensionEnabled" 
          type="checkbox"
          @change="handleExcludeToggle"
        >
        <span class="slider round" />
      </label>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { TranslationMode } from '@/shared/config/config.js'
import browser from 'webextension-polyfill'
import IconButton from '@/components/shared/IconButton.vue'
import PageTranslationButton from '@/features/page-translation/components/PageTranslationButton.vue'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'PopupHeader');

// Resource tracker for memory management
const tracker = useResourceTracker('popup-header');

// Props
const props = defineProps({
  targetLanguage: {
    type: String,
    default: null
  },
  provider: {
    type: String,
    default: ''
  }
})

// Refs
const sidePanelButton = ref(null)

// Stores
const settingsStore = useSettingsStore()
const translationStore = useTranslationStore()

// Composables
const {
  isSelectModeActive,
  toggleSelectElement
} = useSelectElementTranslation()
const { handleError } = useErrorHandler()
const { sendMessage } = useMessaging(MessageContexts.POPUP)
const { t } = useUnifiedI18n()

// State
const isExtensionEnabled = ref(true) // نشان‌دهنده فعال بودن افزونه در صفحه فعلی

// Computed
const isExtensionEnabledGlobal = computed(() => {
  return settingsStore.settings?.EXTENSION_ENABLED ?? true
})

const isSelectElementEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.TRANSLATE_WITH_SELECT_ELEMENT ?? true)
})

const isWholePageEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.WHOLE_PAGE_TRANSLATION_ENABLED ?? true)
})

// Methods
const handleSelectElement = async () => {
  logger.debug('Select Element button clicked!')
  
  try {
    // Resolve provider based on hierarchy:
    // 1. If Sync is ON, use UI's active provider
    // 2. If Sync is OFF, use setting from MODE_PROVIDERS (if not null)
    // 3. Fallback to UI's active provider (legacy behavior)
    let effectiveProvider;
    if (translationStore.ephemeralSync.element && translationStore.selectedProvider) {
      effectiveProvider = translationStore.selectedProvider;
    } else {
      const modeKey = TranslationMode.Select_Element;
      const settingProvider = settingsStore.settings?.MODE_PROVIDERS?.[modeKey];
      effectiveProvider = settingProvider || props.provider;
    }

    logger.debug('[PopupHeader] Select element button clicked', { 
      provider: effectiveProvider,
      isSynced: translationStore.ephemeralSync.element 
    })
    
    const success = await toggleSelectElement({ 
      targetLanguage: props.targetLanguage,
      provider: effectiveProvider
    })
    if (success) {
      logger.debug('[PopupHeader] Select element mode toggled successfully')
      window.close()
    } else {
      logger.debug('[PopupHeader] Select element toggle failed, keeping popup open')
    }
  } catch (error) {
    logger.error('Select element toggle failed:', error)
    await handleError(error, 'PopupHeader-selectElement')
  }
}

const handleClearStorage = () => {
  logger.debug('🧹 Clear Storage button clicked!')
  const event = new CustomEvent('clear-storage')
  document.dispatchEvent(event)
}

const handleRevert = async () => {
  logger.debug('Revert button clicked!')
  try {
    logger.debug('[PopupHeader] Executing revert action')

    // Use sendMessage (goes through background script) for proper error handling
    const response = await sendMessage({
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: MessageContexts.POPUP,
      messageId: `popup-revert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now()
    })

    if (response?.success) {
      logger.debug(`[PopupHeader] Revert successful: ${response.revertedCount || 0} translations reverted`)
    } else if (response?.isRestrictedPage) {
      // Tab is restricted - log as debug and exit gracefully
      logger.debug('Revert action blocked (restricted page):', {
        message: response.message,
        tabUrl: response.tabUrl
      });
      return;
    } else {
      const errorMsg = response?.error || response?.message || 'Unknown error'
      await handleError(new Error(`Revert failed: ${errorMsg}`), {
        context: 'popup-header-revert-failed',
        isSilent: true // Silent error handling for restricted pages
      })
    }

  } catch (error) {
    // Check if this is a restricted page error with response data
    if (error.isRestrictedPage) {
      logger.debug('Revert action blocked (restricted page):', {
        message: error.message,
        tabUrl: error.tabUrl
      });
      return; // Exit gracefully without showing error to user
    }

    // Handle all errors silently - ErrorHandler will automatically handle tab restriction errors silently
    await handleError(error, {
      context: 'PopupHeader-revert',
      isSilent: true // Silent error handling for restricted pages
    })
  }
}

const handleOpenSettings = async () => {
  logger.debug('⚙️ Settings button clicked!')
  try {
    await browser.runtime.openOptionsPage()
    logger.debug('Options page opened successfully')
    window.close()
  } catch (error) {
    logger.error('Failed to open settings:', error)
    await handleError(error, 'PopupHeader-openSettings')
  }
}

const handleExcludeToggle = async () => {
  logger.debug('🚫 Exclude Toggle button clicked! Current state:', isExtensionEnabled.value)
  try {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    })
    
    if (activeTab) {
      // isExtensionEnabled = true یعنی exclude = false
      // isExtensionEnabled = false یعنی exclude = true
      const exclude = !isExtensionEnabled.value
      logger.debug('🚫 Setting page exclusion to:', exclude, 'for URL:', activeTab.url)
      
      await sendMessage({
        action: MessageActions.Set_Exclude_Current_Page,
        data: {
          exclude: exclude,
          url: activeTab.url,
        },
      })
      
      logger.debug('Page exclusion updated successfully')
    }
  } catch (error) {
    logger.error('Failed to toggle exclusion:', error)
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
      // اگر صفحه excluded باشد، افزونه غیرفعال است
      // اگر صفحه excluded نباشد، افزونه فعال است
      isExtensionEnabled.value = !(response?.excluded || false)
    }
    
    // Add native event listener for sidepanel button (Firefox compatibility)
    if (sidePanelButton.value && sidePanelButton.value.$el) {
      tracker.addEventListener(sidePanelButton.value.$el, 'click', handleOpenSidePanelNative, true)
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-getExcludeStatus')
  }
});

onUnmounted(() => {
  // Cleanup event listener
  if (sidePanelButton.value && sidePanelButton.value.$el) {
    sidePanelButton.value.$el.removeEventListener('click', handleOpenSidePanelNative, true)
  }
})

// Native event handler for cross-browser compatibility
const handleOpenSidePanelNative = async (event) => {
  event.preventDefault()
  event.stopPropagation()
  
  logger.debug('[PopupHeader] Opening sidepanel')
  
  try {
    if (browser.sidebarAction) {
      // Firefox: toggle behavior
      browser.sidebarAction.toggle()
  logger.debug('[PopupHeader] Firefox sidebar toggled')
    } else if (browser.sidePanel) {
      // Chrome: simple open behavior
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      
      if (activeTab?.id) {
        await browser.sidePanel.open({ tabId: activeTab.id })
      } else {
        await browser.sidePanel.open({})
      }
  logger.debug('[PopupHeader] Chrome sidePanel opened')
    }
    
    window.close()
  } catch (error) {
  logger.error('[PopupHeader] Sidepanel failed:', error)
    await handleError(error, 'PopupHeader-sidePanel')
  }
}


</script>

<style scoped>
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 8px;
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--header-border-color);
  flex-direction: row;
}

.toolbar-right-group {
  display: flex;
  gap: 4px;
  align-items: center;
}

.toolbar-left-group {
  display: flex;
  gap: 4px;
}

/* Left group (Translate link) should stay on the left side */
.toolbar-left-group {
  display: flex;
  align-items: center;
  gap: 4px;
  order: 1;
}

/* Right group (icon buttons + switch) should stay on the right side */
.toolbar-right-group {
  display: flex;
  align-items: center;
  gap: 4px;
  order: 2;
  /* Render items from right to left so rightmost is side-panel, then select, ..., and checkbox becomes leftmost */
  flex-direction: row-reverse;
}


/* Responsive adjustments using Media Queries */
@media (max-width: 480px) {
  .header-toolbar {
    padding: 4px 4px 4px 8px;
    flex-wrap: nowrap;
    gap: 8px;
    min-height: 38px;
  }

  .toolbar-right-group {
    gap: 4px;
    flex-grow: 1;
    justify-content: flex-start;
  }

  .toolbar-left-group {
    flex-grow: 1;
  }

  .ti-toolbar-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ti-toolbar-icon {
    width: 20px;
    height: 20px;
  }

  .switch {
    width: 44px;
    height: 24px;
  }

  .slider:before {
    height: 20px;
    width: 20px;
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }
}

/* Icon styles are now handled by popup.scss global styles */

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