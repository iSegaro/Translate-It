<template>
  <div
    :class="[
      'content-app-container', 
      TRANSLATION_HTML.NO_TRANSLATE_CLASS,
      settingsStore.isDarkTheme ? 'theme-dark' : 'theme-light'
    ]"
    :translate="TRANSLATION_HTML.NO_TRANSLATE_VALUE"
  >
    <!-- نمونه استفاده از ترجمه -->
    <!--{{ $t('app_welcome') }} -->
    
    <!-- This will host all in-page UI components -->
    <Toaster
      v-if="shouldShowGlobalUI"
      rich-colors
      position="bottom-right"
      expand
      :toast-options="{
        style: {
          pointerEvents: 'auto',
          cursor: 'auto',
          zIndex: 2147483647,
          // direction and textAlign removed to allow CSS class-based RTL/LTR support
          unicodeBidi: 'plaintext',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          maxWidth: '320px',
          minWidth: '280px',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }
      }"
    />
    <template v-if="isExtensionEnabled && settingsStore.isInitialized">
      <TextFieldIcon
        v-for="icon in activeIcons"
        :id="icon.id"
        :key="icon.id"
        :ref="el => setIconRef(icon.id, el)"
        :position="icon.position"
        :visible="icon.visible !== false"
        :target-element="icon.targetElement"
        :attachment-mode="icon.attachmentMode || 'smart'"
        :positioning-mode="icon.positioningMode || 'absolute'"
        @click="onIconClick"
        @position-updated="onIconPositionUpdated"
      />

      <!-- WindowsManager Translation Windows -->
      <TranslationWindow
        v-for="window in translationWindows"
        :id="window.id"
        :key="window.id"
        :position="window.position"
        :selected-text="window.selectedText"
        :initial-translated-text="window.translatedText"
        :theme="window.theme"
        :is-loading="window.isLoading"
        :is-error="window.isError"
        :error-type="window.errorType"
        :can-retry="window.canRetry"
        :needs-settings="window.needsSettings"
        :initial-size="window.initialSize"
        :target-language="window.targetLanguage || 'auto'"
        :provider="window.provider"
        @close="onTranslationWindowClose"
        @speak="onTranslationWindowSpeak"
      />

      <!-- WindowsManager Translation Icons -->
      <TranslationIcon
        v-for="icon in translationIcons"
        :id="icon.id"
        :key="icon.id"
        :position="icon.position"
        :text="icon.text"
        @click="onTranslationIconClick"
        @close="onTranslationIconClose"
      />

      <!-- Select Element Overlays -->
      <ElementHighlightOverlay />

      <!-- Mobile Bottom Sheet -->
      <MobileSheet v-if="isMobileUI && isTopFrame" />

      <!-- Desktop FAB Menu -->
      <DesktopFabMenu 
        v-if="!isMobileUI && showDesktopFab && isTopFrame" 
      />

      <!-- Mobile Floating Action Button (FAB) -->
      <MobileFab
        v-if="isMobileUI && !mobileStore.isOpen && !isSelectModeActive && !isFullscreen && isTopFrame"
      />

      <!-- Page Translation Original Text Tooltip -->
      <PageTranslationTooltip />
    </template>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed, watch } from 'vue';
import browser from 'webextension-polyfill';
import { Toaster, toast } from 'vue-sonner';
import { useWindowsManager } from '@/features/windows/composables/useWindowsManager.js';
import { useSettingsStore } from '@/features/settings/stores/settings.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import { useErrorHandler } from '@/composables/shared/useErrorHandler.js';
import { useUnifiedI18n } from '@/composables/shared/useUnifiedI18n.js';
import TextFieldIcon from '@/features/text-field-interaction/components/TextFieldIcon.vue';
import TranslationWindow from '@/features/windows/components/TranslationWindow.vue';
import TranslationIcon from '@/features/windows/components/TranslationIcon.vue';
import ElementHighlightOverlay from './components/ElementHighlightOverlay.vue';
import MobileSheet from './components/mobile/MobileSheet.vue';
import MobileFab from './components/mobile/MobileFab.vue';
import DesktopFabMenu from './components/desktop/DesktopFabMenu.vue';
import PageTranslationTooltip from './components/PageTranslationTooltip.vue';
import { deviceDetector } from '@/utils/browser/compatibility.js';
import { TRANSLATION_HTML, MOBILE_CONSTANTS, TRANSLATION_STATUS } from '@/shared/config/constants.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { getSelectElementNotificationManager } from '@/features/element-selection/SelectElementNotificationManager.js';
import { getTranslationString, clearTranslationsCache } from '@/utils/i18n/i18n.js';
import { UI_LOCALE_TO_CODE_MAP } from '@/shared/config/languageConstants.js';
import { CONFIG } from '@/shared/config/config.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';

const pageEventBus = window.pageEventBus;

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'ContentApp');

// Detection for iframe vs main frame
const isTopFrame = window === window.top;

// Check if we can access the top frame (Same-Origin check)
const canAccessTop = (() => {
  try {
    return !!(window.top && window.top.location && window.top.location.href);
  } catch (e) {
    return false;
  }
})();

// A frame should show its own global UI (Toaster, FABs) if:
// 1. It is the top frame
// 2. OR it is a cross-origin iframe (isolated from top frame's UI/Events)
const shouldShowGlobalUI = computed(() => isTopFrame || !canAccessTop);

// Localization helper for template (Standard project approach)
useUnifiedI18n();

// Use WindowsManager composable
const {
  translationWindows,
  translationIcons,
  onTranslationIconClick,
  onTranslationWindowClose,
  onTranslationWindowSpeak,
  onTranslationIconClose,
  setupEventListeners
} = useWindowsManager();

// Resource tracker for automatic cleanup
const tracker = useResourceTracker('content-app')

// Toast integration
let toastIntegration = null;

// SelectElement Notification Manager
let selectElementNotificationManager = null;

// Mobile Store
const mobileStore = useMobileStore();
const settingsStore = useSettingsStore();
const { getErrorForDisplay } = useErrorHandler();



// Debounce cancel requests to prevent event loops
// Reactive RTL value for toasts (sync access - optimal performance)
const toastRTL = ref(false);

// OPTIMIZED: Get RTL value by reading directly from storage (bypasses SettingsManager cache)
// Uses getTranslationString with explicit lang code to avoid cache issues
const getRTLFromStorage = async () => {
  // Read locale directly from storage - bypass SettingsManager cache entirely
  // ۱. اولویت با تنظیمات کاربر
  const storage = await browser.storage.local.get({ APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'en' });
  const locale = storage.APPLICATION_LOCALIZE;

  // Use centralized locale to language code mapping from languageConstants.js
  let langCode = UI_LOCALE_TO_CODE_MAP[locale];

  // Fallback: if not found, try to use locale directly if it's a 2-letter code
  if (!langCode) {
    langCode = locale.length === 2 ? locale : 'en';
  }

  // Clear cache and get RTL value with explicit language code
  clearTranslationsCache();
  const rtlValue = await getTranslationString('IsRTL', langCode);

  const isRTL = rtlValue === 'true';
  logger.debug('[Toast] RTL from storage:', { locale, langCode, isRTL });

  return isRTL;
};

// Function to update RTL (no delay, direct storage read)
const updateToastRTL = async () => {
  toastRTL.value = await getRTLFromStorage();
};

// Text field icon state (separate from WindowsManager)
const isSelectModeActive = ref(false);
const isFullscreen = computed(() => mobileStore.isFullscreen); 
const isExtensionEnabled = computed(() => settingsStore.settings?.EXTENSION_ENABLED !== false);
const showDesktopFab = computed(() => settingsStore.settings?.SHOW_DESKTOP_FAB || false);

// Determine if we should use Mobile UI based on device and user preference
const isMobileUI = computed(() => {
  const mode = settingsStore.settings?.MOBILE_UI_MODE || MOBILE_CONSTANTS.UI_MODE.AUTO;
  if (mode === MOBILE_CONSTANTS.UI_MODE.MOBILE) return true;
  if (mode === MOBILE_CONSTANTS.UI_MODE.DESKTOP) return false;
  return deviceDetector.shouldEnableMobileUI();
});

// Only watch for localization changes to update RTL (Performance Optimized)
watch(() => settingsStore.settings?.APPLICATION_LOCALIZE, (newLocale) => {
  if (newLocale) {
    logger.info('[ContentApp] Language changed reactively:', newLocale);
    updateToastRTL();
  }
});

const activeIcons = ref([]); // Stores { id, position, visible, targetElement, attachmentMode } for each icon
const iconRefs = ref(new Map()); // Stores Vue component references

// Icon reference management
const setIconRef = (iconId, el) => {
  if (el) {
    iconRefs.value.set(iconId, el);
  } else {
    iconRefs.value.delete(iconId);
  }
};

const getIconRef = (iconId) => {
  return iconRefs.value.get(iconId);
};



const onIconClick = (id) => {
  logger.info(`TextFieldIcon clicked: ${id}`);
  // Emit an event back to the content script to handle the click
  pageEventBus.emit('text-field-icon-clicked', { id });
};

const onIconPositionUpdated = (data) => {
  logger.debug(`TextFieldIcon position updated:`, data);
  // Optionally notify about position changes
};

const setupOutsideClickHandler = () => {
  // NOTE: Outside click handling is now managed by TextSelectionManager
  // to avoid conflicts and ensure proper iframe support.
  // This avoids double handling of outside clicks which was causing
  // translation windows to close when clicked inside them.
};

// Mobile FAB behavior state
const updateFullscreenState = () => {
  const isNowFullscreen = !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
  mobileStore.setFullscreen(isNowFullscreen);
};

logger.debug('ContentApp script setup executed.');

onMounted(async () => {
  // Ensure settings are loaded
  if (!settingsStore.isInitialized) {
    await settingsStore.loadSettings();
  }


  const isInIframe = window !== window.top;
  const executionMode = isInIframe ? 'iframe' : 'main-frame';

  logger.info(`ContentApp mounted in ${executionMode} mode`);
  logger.info('Device Detection:', { 
    isMobile: deviceDetector.isMobile(), 
    shouldEnableUI: deviceDetector.shouldEnableMobileUI(),
    innerWidth: window.innerWidth, 
    touchPoints: navigator.maxTouchPoints,
    userAgent: navigator.userAgent
  });

  // Setup global click listener for outside click detection
  setupOutsideClickHandler();

  // Initialize Toast Integration System
  let toastIntegration = null;
  try {
    toastIntegration = ToastIntegration.createSingleton(pageEventBus);
    toastIntegration.initialize();
    // ToastIntegration initialized successfully
  } catch (error) {
    logger.warn('ToastIntegration initialization failed:', error);
    // Continue without toast integration if it fails
  }

  // Initialize SelectElement Notification Manager
  try {
    const notificationManager = new NotificationManager();
    selectElementNotificationManager = await getSelectElementNotificationManager(notificationManager);
    // SelectElementNotificationManager initialized successfully
  } catch (error) {
    logger.warn('Failed to initialize SelectElementNotificationManager:', error);
  }

  // CRITICAL: Initialize RTL for toasts
  // 1. Initialize on mount
  await updateToastRTL();

  // Fullscreen listeners via tracker
  tracker.addEventListener(document, 'fullscreenchange', updateFullscreenState);
  tracker.addEventListener(document, 'webkitfullscreenchange', updateFullscreenState);
  tracker.addEventListener(document, 'mozfullscreenchange', updateFullscreenState);
  tracker.addEventListener(document, 'MSFullscreenChange', updateFullscreenState);
  
  // Initial check
  updateFullscreenState();

  const toastMap = {
    error: toast.error,
    warning: toast.warning,
    success: toast.success,
    info: toast.info,
    status: toast.loading,
    revert: toast,
    'select-element': toast.info,
  };

  // Use a global Set to prevent duplicate notifications
  if (!window.translateItShownNotifications) {
    window.translateItShownNotifications = new Set();
  }
  
  // Track dismissed notifications to prevent double dismissal
  if (!window.translateItDismissedNotifications) {
    window.translateItDismissedNotifications = new Set();
  }
  
    
  
  tracker.addEventListener(pageEventBus, 'show-notification', async (detail) => {
    // Only process notifications if this frame is responsible for showing global UI
    if (!shouldShowGlobalUI.value) return;

    // Create a unique key for this notification
    const notificationKey = `${detail.message}-${detail.type}-${Date.now()}`;

    // Check if this notification was already shown recently (within 1 second)
    const recentKeys = Array.from(window.translateItShownNotifications).filter(key => {
      const timestamp = parseInt(key.split('-').pop());
      return Date.now() - timestamp < 1000; // 1 second window
    });

    const isDuplicate = recentKeys.some(key =>
      key.startsWith(`${detail.message}-${detail.type}`)
    );

    if (isDuplicate) {
      return;
    }

    // Add to set and show notification
    window.translateItShownNotifications.add(notificationKey);

    // Clean up old entries (keep only last 10)
    if (window.translateItShownNotifications.size > 10) {
      const entries = Array.from(window.translateItShownNotifications);
      entries.slice(0, -10).forEach(key => {
        window.translateItShownNotifications.delete(key);
      });
    }



    const { id, message, type, duration, actions, persistent } = detail;
    const toastFn = toastMap[type] || toast.info;

    // CRITICAL: Use reactive RTL value (SYNC - optimal performance)
    const detectedDirection = toastRTL.value ? 'rtl' : 'ltr';

    const toastOptions = {
      id,
      duration: persistent ? Infinity : duration,
      // CRITICAL: Apply direction via style option (most reliable method)
      style: {
        direction: detectedDirection,
        textAlign: toastRTL.value ? 'right' : 'left'
      }
    };

    // Add action buttons if provided
    if (actions && actions.length > 0) {
      // Create the action handler
      const actionHandler = () => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        logger.debug('Toast action clicked:', actions[0].eventName);
        pageEventBus.emit(actions[0].eventName);
        toast.dismiss(id);
      };

      toastOptions.action = {
        label: actions[0].label,
        onClick: actionHandler
      };
    }
    
    toastFn(message, toastOptions);
  });

  tracker.addEventListener(pageEventBus, 'dismiss_notification', (detail) => {
    logger.info('Received dismiss_notification event:', detail);

    // Skip select-element notifications - they are managed by SelectElementNotificationManager
    if (detail.id.startsWith('select-element-') || detail.id.includes('select-element')) {
      logger.debug('Ignoring dismiss_notification for select-element notification:', detail.id);
      return;
    }

    // Prevent double dismissal
    if (window.translateItDismissedNotifications.has(detail.id)) {
      logger.debug('Notification already dismissed, ignoring:', detail.id);
      return;
    }

    window.translateItDismissedNotifications.add(detail.id);

    // Force dismiss - try multiple methods to ensure cleanup
    toast.dismiss(detail.id);

    // Clean up after a delay
    setTimeout(() => {
      window.translateItDismissedNotifications.delete(detail.id);
    }, 2000);
  });

  tracker.addEventListener(pageEventBus, 'dismiss_all_notifications', () => {
    logger.info('Received dismiss_all_notifications event');
    // Dismiss all notifications except select-element ones
    toast.dismiss((t) => !t.id || (!t.id.includes('select-element') && !t.id.startsWith('select-element-')));
  });

  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.SHOW_MOBILE_SHEET, (detail) => {
    logger.info('Received SHOW_MOBILE_SHEET event:', detail);
    
    if (detail.isOpen === false) {
      mobileStore.closeSheet();
      return;
    }

    // Update selection data if provided
    if (detail.text !== undefined) {
      mobileStore.updateSelectionData({
        text: detail.text,
        translation: detail.translation || '',
        sourceLang: detail.sourceLang || 'auto',
        targetLang: detail.targetLang || 'en',
        isLoading: detail.isLoading || false,
        isError: detail.isError || false,
        error: detail.error || null
      });
    }

    // Open sheet with requested view/state
    mobileStore.openSheet(detail.view || MOBILE_CONSTANTS.VIEWS.SELECTION, detail.state || MOBILE_CONSTANTS.SHEET_STATE.PEEK);
  });

  // Page Translation Events (Synced globally for Mobile Sheet and Desktop FAB)
  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_START, (detail) => {
    mobileStore.setPageTranslation({ 
      isTranslating: true, 
      isTranslated: false,
      isAutoTranslating: detail.isAutoTranslating || false,
      status: TRANSLATION_STATUS.TRANSLATING, 
      translatedCount: 0,
      totalCount: 0,
      errorMessage: null
    });

    if (deviceDetector.isMobile()) {
      logger.info('Mobile: Page translation started, switching view');
      mobileStore.setView(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION);
      mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK);
    }
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_PROGRESS, (detail) => {
    const translatedCount = detail.translatedCount || detail.translated || mobileStore.pageTranslationData.translatedCount;
    const totalCount = detail.totalCount || mobileStore.pageTranslationData.totalCount;
    const isDone = totalCount > 0 && translatedCount >= totalCount;

    mobileStore.setPageTranslation({
      translatedCount,
      totalCount,
      status: isDone ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.TRANSLATING
    });
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_COMPLETE, (detail) => {
    mobileStore.setPageTranslation({ 
      isTranslating: false, 
      isTranslated: true,
      isAutoTranslating: detail.isAutoTranslating !== undefined ? detail.isAutoTranslating : mobileStore.pageTranslationData.isAutoTranslating,
      status: TRANSLATION_STATUS.COMPLETED, 
      translatedCount: detail.translatedCount || mobileStore.pageTranslationData.translatedCount,
      totalCount: detail.totalCount || mobileStore.pageTranslationData.totalCount || detail.translatedCount
    });
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_ERROR, async (detail) => {
    const errorInfo = await getErrorForDisplay(detail.error || 'Translation failed', 'page-translation-content');
    mobileStore.setPageTranslation({ 
      isTranslating: false, 
      isTranslated: false, 
      isAutoTranslating: false, 
      status: TRANSLATION_STATUS.ERROR,
      errorMessage: errorInfo.message
    });
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_RESTORE_COMPLETE, () => {
    // Keep error state visible so user can see what happened
    if (mobileStore.pageTranslationData.status !== TRANSLATION_STATUS.ERROR) {
      mobileStore.resetPageTranslation();
    }
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_AUTO_RESTORE_COMPLETE, (detail) => {
    const hasTranslations = detail.translatedCount > 0;
    mobileStore.setPageTranslation({ 
      isTranslating: false,
      isAutoTranslating: false,
      isTranslated: hasTranslations,
      status: hasTranslations ? TRANSLATION_STATUS.COMPLETED : TRANSLATION_STATUS.IDLE
    });
  });

  // Handle open-options-page requests from translation windows and notifications
  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS, (detail) => {
    logger.info('Received open-options-page event:', detail);
    const anchor = detail?.section || detail?.anchor;
    
    browser.runtime.sendMessage({
      action: MessageActions.OPEN_OPTIONS_PAGE,
      data: { anchor }
    }).catch(err => logger.error('Error opening options page:', err));
  });

  // Select element notifications should NOT be auto-dismissed
  // They are controlled by SelectElementNotificationManager only
  tracker.addEventListener(pageEventBus, 'dismiss-select-element-notification', () => {
    logger.debug('Received dismiss-select-element-notification event - ignoring (controlled by SelectElementNotificationManager)');
    // Do nothing - select element notifications are managed by their own manager
  });

  // Test event to confirm communication
  tracker.addEventListener(pageEventBus, 'ui-host-mounted', () => {
    logger.info('Successfully received the ui-host-mounted test event!');
  });


  // Listen for Select Element Mode changes
  tracker.addEventListener(pageEventBus, 'select-mode-activated', () => {
    logger.info('Event: select-mode-activated');
    isSelectModeActive.value = true;
  });

  tracker.addEventListener(pageEventBus, 'select-mode-deactivated', () => {
    logger.info('Event: select-mode-deactivated');
    isSelectModeActive.value = false;
  });

  // Listen for TextFieldIcon events
  tracker.addEventListener(pageEventBus, 'add-field-icon', (detail) => {
    // SECURITY/DUPLICATION FIX: Only handle the icon if it's meant for this specific frame.
    // We check if the target element exists in this document to avoid duplicate icons 
    // in same-origin parent/iframe scenarios.
    const isForThisFrame = detail.targetElement && document.contains(detail.targetElement);
    
    if (!isForThisFrame) {
      logger.debug('Field icon requested, but target element is not in this frame. Skipping.');
      return;
    }

    logger.info('Event: add-field-icon', detail);
    // Ensure no duplicate icons for the same ID
    if (!activeIcons.value.some(icon => icon.id === detail.id)) {
      activeIcons.value.push({
        id: detail.id,
        position: detail.position,
        visible: detail.visible !== false,
        targetElement: detail.targetElement,
        attachmentMode: detail.attachmentMode || 'smart',
        positioningMode: detail.positioningMode || 'absolute'
      });
      logger.debug('Active icons after adding:', activeIcons.value);
    }
  });

  tracker.addEventListener(pageEventBus, 'remove-field-icon', (detail) => {
    logger.info('Event: remove-field-icon', detail);
    const iconIndex = activeIcons.value.findIndex(icon => icon.id === detail.id);
    if (iconIndex !== -1) {
      // Clean up component reference
      iconRefs.value.delete(detail.id);
      // Remove from active icons
      activeIcons.value.splice(iconIndex, 1);
    }
  });

  tracker.addEventListener(pageEventBus, 'remove-all-field-icons', () => {
    logger.info('Event: remove-all-field-icons');
    // Clear all component references
    iconRefs.value.clear();
    // Clear all icons
    activeIcons.value = [];
  });

  // Listen for enhanced TextFieldIcon events
  tracker.addEventListener(pageEventBus, 'update-field-icon-position', (detail) => {
    logger.debug('Event: update-field-icon-position', detail);
    const icon = activeIcons.value.find(icon => icon.id === detail.id);
    if (icon) {
      icon.position = detail.position;
      icon.visible = detail.visible !== false;
      
      // Update the component directly
      const iconComponent = getIconRef(detail.id);
      if (iconComponent) {
        // Use immediate update for smooth following
        if (iconComponent.updatePositionImmediate) {
          iconComponent.updatePositionImmediate(detail.position);
        } else if (iconComponent.updatePosition) {
          iconComponent.updatePosition(detail.position);
        }

        // Enable smooth following if this is a smooth-scroll-follow event
        // (We can detect this by checking if position updates are coming rapidly)
        if (!iconComponent.isSmoothFollowing?.()) {
          iconComponent.enableSmoothFollowing?.();
        }
      }
    }
  });

  tracker.addEventListener(pageEventBus, 'update-field-icon-visibility', (detail) => {
    const icon = activeIcons.value.find(icon => icon.id === detail.id);
    if (icon) {
      icon.visible = detail.visible;

      // Update the component directly
      const iconComponent = getIconRef(detail.id);
      if (iconComponent) {
        if (detail.visible && iconComponent.show) {
          iconComponent.show();
        } else if (!detail.visible && iconComponent.hide) {
          iconComponent.hide();
        }
      }
    }
  });

  // Sync Element Translation state across frames
  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_AVAILABLE, () => {
    logger.debug('Received ELEMENT_TRANSLATIONS_AVAILABLE event');
    mobileStore.setHasElementTranslations(true);
  });

  tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.ELEMENT_TRANSLATIONS_CLEARED, () => {
    logger.debug('Received ELEMENT_TRANSLATIONS_CLEARED event');
    mobileStore.setHasElementTranslations(false);
  });

  // Setup WindowsManager event listeners through composable
  setupEventListeners();
  
  // Listen for navigation events to clean up UI state
  tracker.addEventListener(pageEventBus, 'navigation-detected', (detail) => {
    logger.info('Navigation detected, cleaning up UI state:', detail);
    
    // Close all translation windows
    if (translationWindows.value.length > 0) {
      translationWindows.value.forEach(window => {
        onTranslationWindowClose(window.id);
      });
    }
    
    // Close all translation icons  
    if (translationIcons.value.length > 0) {
      translationIcons.value.forEach(icon => {
        onTranslationIconClose(icon.id);
      });
    }
    
    // Clear all field icons
    activeIcons.value = [];
    
    // Reset select mode state
    isSelectModeActive.value = false;
    
    // Dismiss all notifications
    pageEventBus.emit('dismiss_all_notifications');
  });
});

onUnmounted(async () => {
  logger.info('ContentApp component is being unmounted.');

  // Shutdown toast integration if it was initialized
  try {
    if (toastIntegration) {
      toastIntegration.shutdown();
    }
  } catch (error) {
    logger.warn('Error shutting down ToastIntegration:', error);
  }

  // Cleanup SelectElement Notification Manager
  try {
    if (selectElementNotificationManager) {
      await selectElementNotificationManager.cleanup();
      // Clear the singleton instance
      const { SelectElementNotificationManager } = await import('@/features/element-selection/SelectElementNotificationManager.js');
      SelectElementNotificationManager.clearInstance();
    }
  } catch (error) {
    logger.warn('Error cleaning up SelectElementNotificationManager:', error);
  }
});
</script>

<style>
/* Since this is in a Shadow DOM, these styles are completely isolated. */
.content-app-container {
  position: fixed !important;
  inset: 0 !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  display: block !important;
  overflow: hidden !important;
}

/* Individual components inside will override this (e.g., toaster, toolbars) */
.content-app-container > * {
  pointer-events: all !important; /* Re-enable pointer events for children */
}

/* CRITICAL: Toast text direction for RTL/LTR support */
/* Direction is set based on extension locale (IsRTL from getTranslationString) via inline styles */
/* Do NOT use !important rules that would override inline styles */
[data-sonner-toast] {
  /* direction and text-align removed to allow inline styles to work */
}

/* Also target the content div inside toast */
[data-sonner-toast] > div[data-content] > div {
  /* direction and text-align removed to allow inline styles to work */
}
</style>