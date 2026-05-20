<template>
  <div class="ti-header-toolbar">
    <!-- 1. Translate Page (Leftmost) -->
    <PageTranslationButton
      v-if="isWholePageEnabled"
      text-only
      :target-language="targetLanguage"
      :disabled="!isPageTranslationSupported"
      class="ti-page-translate-btn"
    />

    <!-- Spacer to push remaining items to the right -->
    <div class="ti-header-spacer" />

    <!-- 2. Exclude (Switch) -->
    <label
      class="ti-switch"
      :title="t('popup_exclude_toggle_title') || 'فعال/غیرفعال در این صفحه'"
    >
      <input 
        v-model="isExtensionEnabled" 
        type="checkbox"
        @change="handleExcludeToggle"
      >
      <span class="ti-slider" />
    </label>

    <!-- 3. Settings -->
      @click="handleOpenSettings"
    />

    <!-- 4. Subtitle Translator -->
    <IconButton
      icon="subtitle.png"
      :alt="t('popup_subtitle_alt_icon') || 'Subtitle Translator'"
      :title="t('popup_subtitle_title_icon') || 'ترجمه زیرنویس'"
      type="toolbar"
      class="ti-btn-subtitle"
      @click="handleOpenSubtitlePage"
    />
    
    <!-- 5. Revert -->
    <IconButton
      v-if="isSelectElementEnabled"
      icon="revert.png"
      :alt="t('popup_revert_alt_icon') || 'Revert'"
      :title="t('popup_revert_title_icon') || 'بازگرداندن به حالت قبلی'"
      type="toolbar"
      variant="revert"
      class="ti-btn-revert"
      @click="handleRevert"
    />

    <!-- 6. Screen Capture -->
    <IconButton
      v-if="isScreenCaptureEnabled"
      icon="capture.svg"
      :alt="t('popup_screen_capture_alt_icon') || 'Screen Capture'"
      :title="t('popup_screen_capture_title_icon') || 'تصویربرداری از صفحه'"
      type="toolbar"
      class="ti-btn-capture"
      @click="handleScreenCapture"
    />

    <!-- 7. Select Element -->
    <IconButton
      v-if="isSelectElementEnabled"
      icon="select.png"
      :alt="t('popup_select_element_alt_icon') || 'Select Element'"
      :title="!isSelectElementSupported ? (t('provider_does_not_support_bulk') || 'این سرویس از حالت انتخاب پشتیبانی نمی‌کند') : (t('popup_select_element_title_icon') || 'حالت انتخاب با موس')"
      type="toolbar"
      :active="isSelectModeActive"
      :disabled="!isSelectElementSupported"
      class="ti-btn-select"
      @click="handleSelectElement"
    />

    <!-- 8. Mouse Hover Toggle -->
    <IconButton
      icon="mouse-hover.png"
      :alt="isMouseHoverEnabled ? (t('mouse_hover_disable_label') || 'غیرفعال‌سازی ترجمه با ماوس') : (t('mouse_hover_enable_label') || 'فعال‌سازی ترجمه با ماوس')"
      :title="isMouseHoverEnabled ? (t('mouse_hover_disable_label') || 'غیرفعال‌سازی ترجمه با ماوس') : (t('mouse_hover_enable_label') || 'فعال‌سازی ترجمه با ماوس')"
      type="toolbar"
      :active="isMouseHoverEnabled"
      class="ti-btn-mouse-hover"
      @click="toggleMouseHover"
    />

    <!-- 7. Open Sidepanel (Rightmost) -->
    <IconButton
      v-if="!IsMobile"
      ref="sidePanelButton"
      icon="side-panel.png"
      :title="t('popup_open_side_panel_title') || 'باز کردن در پنل کناری'"
      type="toolbar"
      class="ti-btn-sidepanel"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSelectElementTranslation } from '@/features/translation/composables/useTranslationModes.js'
import { useMouseHoverToggle } from '@/features/mouse-hover/composables/useMouseHoverToggle.js'
import { useMessaging } from '@/shared/messaging/composables/useMessaging.js'
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js'
import { useSettingsStore } from '@/features/settings/stores/settings.js'
import { useTranslationStore } from '@/features/translation/stores/translation.js'
import { TranslationMode } from '@/shared/config/config.js'
import { findProviderById } from '@/features/translation/providers/ProviderManifest.js'
import browser from 'webextension-polyfill'
import IconButton from '@/components/shared/IconButton.vue'
import PageTranslationButton from '@/features/page-translation/components/PageTranslationButton.vue'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'
import { MessageContexts } from '@/shared/messaging/core/MessagingCore.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { getBrowserInfoSync } from '@/utils/browser/compatibility.js'

// Import adjacent SCSS
import './PopupHeader.scss';

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
const { isMouseHoverEnabled, toggleMouseHover } = useMouseHoverToggle()
const { handleError } = useErrorHandler()
const { sendMessage } = useMessaging(MessageContexts.POPUP)
const { t } = useUnifiedI18n()

// State
const isExtensionEnabled = ref(true) // نشان‌دهنده فعال بودن افزونه در صفحه فعلی

// Computed
const IsMobile = computed(() => {
  return getBrowserInfoSync().isMobile
})

const isExtensionEnabledGlobal = computed(() => {
  return settingsStore.settings?.EXTENSION_ENABLED ?? true
})

/**
 * Gets the effective provider for a specific mode, accounting for synchronization
 */
const getEffectiveProvider = (mode) => {
  const syncKey = mode === TranslationMode.Page ? 'page' : 'element'
  if (translationStore.ephemeralSync[syncKey] && translationStore.selectedProvider) {
    return translationStore.selectedProvider
  }
  
  // Fallback to mode-specific settings or global provider
  return settingsStore.settings?.MODE_PROVIDERS?.[mode] || 
         settingsStore.settings.TRANSLATION_API || 
         'googlev2'
}

/**
 * Checks if the provider for a specific mode supports bulk operations
 */
const supportsBulk = (mode) => {
  const providerId = getEffectiveProvider(mode)
  const provider = findProviderById(providerId)
  return provider?.features?.includes('bulk') ?? true
}

const isSelectElementSupported = computed(() => supportsBulk(TranslationMode.Select_Element))
const isPageTranslationSupported = computed(() => supportsBulk(TranslationMode.Page))

const isSelectElementEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.TRANSLATE_WITH_SELECT_ELEMENT ?? true)
})

const isScreenCaptureEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.ENABLE_SCREEN_CAPTURE ?? true)
})

const isWholePageEnabled = computed(() => {
  return isExtensionEnabledGlobal.value && (settingsStore.settings?.WHOLE_PAGE_TRANSLATION_ENABLED ?? true)
})

// Methods
const handleSelectElement = async () => {
  if (!isSelectElementSupported.value) return

  logger.debug('Select Element button clicked!')
  
  try {
    const effectiveProvider = getEffectiveProvider(TranslationMode.Select_Element)

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

const handleScreenCapture = async () => {
  logger.debug('Screen Capture button clicked!')
  try {
    const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true })
    if (activeTab?.id) {
      await sendMessage({
        action: MessageActions.START_SCREEN_CAPTURE,
        data: { tabId: activeTab.id }
      })
      window.close()
    }
  } catch (error) {
    await handleError(error, 'PopupHeader-screenCapture')
  }
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

const handleOpenSubtitlePage = async () => {
  try {
    await browser.tabs.create({
      url: browser.runtime.getURL('src/html/subtitle.html')
    })
    window.close()
  } catch (error) {
    await handleError(error, 'PopupHeader-openSubtitlePage')
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
