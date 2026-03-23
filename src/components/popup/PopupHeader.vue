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
    let effectiveProvider;
    if (translationStore.ephemeralSync.element && translationStore.selectedProvider) {
      effectiveProvider = translationStore.selectedProvider;
    } else {
      const modeKey = TranslationMode.Select_Element;
      const settingProvider = settingsStore.settings?.MODE_PROVIDERS?.[modeKey];
      effectiveProvider = settingProvider || props.provider;
    }

    const success = await toggleSelectElement({ 
      targetLanguage: props.targetLanguage,
      provider: effectiveProvider
    })
    if (success) {
      window.close()
    }
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
    const response = await sendMessage({
      action: MessageActions.REVERT_SELECT_ELEMENT_MODE,
      context: MessageContexts.POPUP,
      messageId: `popup-revert-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      timestamp: Date.now()
    })

    if (!response?.success && !response?.isRestrictedPage) {
      const errorMsg = response?.error || response?.message || 'Unknown error'
      await handleError(new Error(`Revert failed: ${errorMsg}`), { context: 'popup-header-revert-failed', isSilent: true })
    }
  } catch (error) {
    await handleError(error, { context: 'PopupHeader-revert', isSilent: true })
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
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (activeTab) {
      const exclude = !isExtensionEnabled.value
      await sendMessage({
        action: MessageActions.Set_Exclude_Current_Page,
        data: { exclude: exclude, url: activeTab.url },
      })
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-excludeToggle')
  }
}

// Initialize exclude status
onMounted(async () => {
  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (activeTab) {
      const response = await sendMessage({
        action: MessageActions.IS_Current_Page_Excluded,
        data: { url: activeTab.url },
      })
      isExtensionEnabled.value = !(response?.excluded || false)
    }
    if (sidePanelButton.value && sidePanelButton.value.$el) {
      tracker.addEventListener(sidePanelButton.value.$el, 'click', handleOpenSidePanelNative, true)
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-getExcludeStatus')
  }
});

onUnmounted(() => {
  if (sidePanelButton.value && sidePanelButton.value.$el) {
    sidePanelButton.value.$el.removeEventListener('click', handleOpenSidePanelNative, true)
  }
})

const handleOpenSidePanelNative = async (event) => {
  event.preventDefault()
  event.stopPropagation()
  try {
    if (browser.sidebarAction) {
      browser.sidebarAction.toggle()
    } else if (browser.sidePanel) {
      const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (activeTab?.id) {
        await browser.sidePanel.open({ tabId: activeTab.id })
      } else {
        await browser.sidePanel.open({})
      }
    }
    window.close()
  } catch (error) {
    await handleError(error, 'PopupHeader-sidePanel')
  }
}
</script>

<style scoped>
.header-toolbar {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  padding: 8px clamp(8px, 3vw, 16px);
  background-color: var(--header-bg-color);
  border-bottom: 1px solid var(--header-border-color);
  width: 100%;
  box-sizing: border-box;
  min-height: clamp(50px, 10vh, 64px);
  gap: 8px;
  direction: ltr !important; /* Force 'Translate Page' to the LEFT */
}

.toolbar-left-group {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex: 0 0 auto; /* Pinned to the left side */
}

.toolbar-right-group {
  display: flex;
  align-items: center;
  flex: 1 1 auto; /* Take all remaining space */
  gap: clamp(8px, 4vw, 24px);
  flex-direction: row-reverse; /* Order icons from right to left */
  justify-content: space-around; /* Spread icons across available width */
}

.ti-toolbar-button {
  width: clamp(38px, 9vw, 52px);
  height: clamp(38px, 9vw, 52px);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  background-color: transparent;
  border: none;
  cursor: pointer;
}

.ti-toolbar-button:hover {
  background-color: var(--toolbar-link-hover-bg-color);
  transform: scale(1.05);
}

.ti-toolbar-icon {
  width: clamp(22px, 6vw, 30px);
  height: clamp(22px, 6vw, 30px);
  filter: var(--icon-filter);
  opacity: var(--icon-opacity);
}

.header-toolbar :deep(.toolbar-link) {
  font-size: clamp(14px, 4.5vw, 16px);
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  white-space: nowrap;
  background-color: var(--toolbar-link-hover-bg-color);
  color: var(--toolbar-link-color);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.switch {
  position: relative;
  display: inline-block;
  width: clamp(44px, 12vw, 56px);
  height: clamp(24px, 6vw, 30px);
  vertical-align: middle;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #ccc;
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 30px;
}

.slider:before {
  position: absolute;
  content: "";
  height: clamp(18px, 5vw, 24px);
  width: clamp(18px, 5vw, 24px);
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}

input:checked + .slider {
  background-color: #4caf50;
}

input:checked + .slider:before {
  transform: translateX(calc(clamp(44px, 12vw, 56px) - clamp(18px, 5vw, 24px) - 6px));
}

@media (max-width: 380px) {
  .header-toolbar {
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
  .toolbar-left-group, .toolbar-right-group {
    justify-content: center;
    width: 100%;
    flex: 1 0 100%;
  }
}
</style>