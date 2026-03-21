<template>
  <div :class="['content-app-container', TRANSLATION_HTML.NO_TRANSLATE_CLASS]" :translate="TRANSLATION_HTML.NO_TRANSLATE_VALUE">
    <!-- نمونه استفاده از ترجمه -->
    <!--{{ $t('app_welcome') }} -->
    
    <!-- This will host all in-page UI components -->
    <Toaster
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
    <MobileSheet />

    <!-- Mobile Floating Action Button (FAB) -->
    <div 
      v-if="deviceDetector.isMobile() && !mobileStore.isOpen && !isSelectModeActive" 
      class="mobile-fab"
      :style="{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '44px',
        height: '44px',
        background: 'transparent',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 3px 12px rgba(0, 0, 0, 0.15)',
        zIndex: '2147483647',
        pointerEvents: 'auto',
        cursor: 'pointer',
        transition: 'opacity 0.5s ease, transform 0.2s ease',
        opacity: isFabIdle ? '0.35' : '1',
        transform: 'scale(1)'
      }"
      @click="onMobileFabClick"
      @touchstart="startFabIdleTimer"
    >
      <img src="@/icons/extension/extension_icon_64.svg" alt="Translate" style="width: 70%; height: 70%; object-fit: contain;" />
    </div>

    <!-- Mobile-specific Exit Select Mode button -->
    <div 
      v-if="isSelectModeActive && deviceDetector.isMobile()" 
      class="mobile-exit-selection"
      @click="onCancelClick"
    >
      <img src="@/icons/ui/close.png" alt="Exit" />
      <span>Exit Select Mode</span>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
import { Toaster, toast } from 'vue-sonner';
import { useWindowsManager } from '@/features/windows/composables/useWindowsManager.js';
import { useMobileStore } from '@/store/modules/mobile.js';
import { useResourceTracker } from '@/composables/core/useResourceTracker.js';
import TextFieldIcon from '@/features/text-field-interaction/components/TextFieldIcon.vue';
import TranslationWindow from '@/features/windows/components/TranslationWindow.vue';
import TranslationIcon from '@/features/windows/components/TranslationIcon.vue';
import ElementHighlightOverlay from './components/ElementHighlightOverlay.vue';
import MobileSheet from './components/mobile/MobileSheet.vue';
import { deviceDetector } from '@/utils/browser/deviceDetector.js';
import { TRANSLATION_HTML, MOBILE_CONSTANTS } from '@/shared/config/constants.js';
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
import browser from 'webextension-polyfill';

const pageEventBus = window.pageEventBus;

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'ContentApp');

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

// Debounce cancel requests to prevent event loops
let isCancelInProgress = false;
let cancelTimeout = null;

const onCancelClick = () => {
  logger.info('Cancel Select Element mode requested');

  // Prevent multiple cancel requests in quick succession
  if (isCancelInProgress) {
    logger.debug('Cancel already in progress, ignoring duplicate request');
    return;
  }

  isCancelInProgress = true;

  // Emit event only once with proper error handling
  try {
    if (pageEventBus) {
      pageEventBus.emit('cancel-select-element-mode');
      logger.debug('cancel-select-element-mode event emitted successfully');
    }
  } catch (error) {
    logger.warn('Error emitting cancel-select-element-mode event:', error);
  }

  // Reset flag after a delay to prevent event loops
  if (cancelTimeout) clearTimeout(cancelTimeout);
  cancelTimeout = setTimeout(() => {
    isCancelInProgress = false;
    cancelTimeout = null;
    logger.debug('Cancel request flag reset');
  }, 1000); // 1 second debounce
};

// Reactive RTL value for toasts (sync access - optimal performance)
const toastRTL = ref(false);

// OPTIMIZED: Get RTL value by reading directly from storage (bypasses SettingsManager cache)
// Uses getTranslationString with explicit lang code to avoid cache issues
const getRTLFromStorage = async () => {
  // Read locale directly from storage - bypass SettingsManager cache entirely
  // ۱. اولویت با تنظیمات کاربر
  const storage = await browser.storage.local.get({ APPLICATION_LOCALIZE: CONFIG.APPLICATION_LOCALIZE || 'English' });
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

const onMobileFabClick = () => {
  // 1. Check for active DOM selection
  const selection = window.getSelection();
  let selectedText = selection ? selection.toString().trim() : '';

  // 2. Fallback: check WindowsManager state if DOM selection is empty 
  // (sometimes selection is lost when clicking the FAB)
  if (!selectedText && window.windowsManagerInstance && window.windowsManagerInstance.state) {
    selectedText = window.windowsManagerInstance.state.originalText || '';
  }

  if (selectedText) {
    logger.info('FAB clicked with selection, opening SelectionView');
    
    // Setup selection data
    mobileStore.updateSelectionData({
      text: selectedText,
      isLoading: true,
      translation: ''
    });
    
    // Open sheet in selection view
    mobileStore.openSheet(MOBILE_CONSTANTS.VIEWS.SELECTION, MOBILE_CONSTANTS.SHEET_STATE.PEEK);
    
    // Trigger actual translation via WindowsManager
    if (window.windowsManagerInstance) {
      window.windowsManagerInstance._showMobileSheet(selectedText);
    }
  } else {
    // Smart view recovery (Last View behavior):
    let viewToOpen = mobileStore.activeView || MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    
    // Fallback ONLY if selection view is active but has no data
    if (viewToOpen === MOBILE_CONSTANTS.VIEWS.SELECTION && !mobileStore.selectionData.text) {
      viewToOpen = MOBILE_CONSTANTS.VIEWS.DASHBOARD;
    }
    
    logger.info(`FAB clicked without selection, restoring last view: ${viewToOpen}`);
    mobileStore.openSheet(viewToOpen, MOBILE_CONSTANTS.SHEET_STATE.PEEK);
  }
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
const isFabVisible = ref(true);
const isFabIdle = ref(false);
let lastScrollY = window.scrollY;
let fabIdleTimer = null;

const startFabIdleTimer = () => {
  if (fabIdleTimer) clearTimeout(fabIdleTimer);
  isFabIdle.value = false;
  fabIdleTimer = setTimeout(() => {
    isFabIdle.value = true;
  }, 3000); // 3 seconds of inactivity to become semi-transparent
};

const handleScroll = () => {
  // Reset idle timer on scroll to ensure FAB stays opaque while interacting
  startFabIdleTimer();
};

logger.debug('ContentApp script setup executed.');

onMounted(async () => {
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

  // Mobile scroll handling
  if (deviceDetector.isMobile()) {
    window.addEventListener('scroll', handleScroll, { passive: true });
    startFabIdleTimer();
  }

  // Setup global click listener for outside click detection
  setupOutsideClickHandler();

  // Initialize Toast Integration System
  let toastIntegration = null;
  try {
    toastIntegration = ToastIntegration.createSingleton(pageEventBus);
    toastIntegration.initialize({
      onCancelClick: onCancelClick
    });
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

  // CRITICAL: Initialize RTL for toasts + listen for storage changes
  // Using storage.onChanged instead of runtime.onMessage because it fires AFTER storage is updated
  // This ensures we get the fresh value, not the old one

  // 1. Initialize on mount
  await updateToastRTL();

  // 2. Listen for storage changes directly (fires AFTER storage is updated)
  if (browser.storage?.onChanged) {
    const storageListener = (changes, areaName) => {
      if (areaName === 'local' && changes.APPLICATION_LOCALIZE) {
        const newLocale = changes.APPLICATION_LOCALIZE.newValue;
        logger.info('[Toast] Language changed in storage:', newLocale);

        // Update RTL immediately
        updateToastRTL();
      }
    };

    browser.storage.onChanged.addListener(storageListener);

    // Cleanup on unmount
    tracker._toastSettingsCleanup = () => {
      browser.storage.onChanged.removeListener(storageListener);
    };
  }

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

  // Page Translation Events for Mobile
  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_START, (detail) => {
    if (deviceDetector.isMobile()) {
      logger.info('Mobile: Page translation started, switching view');
      mobileStore.setPageTranslation({ 
        isTranslating: true, 
        status: 'translating', 
        progress: 0,
        translatedCount: 0 
      });
      mobileStore.setView(MOBILE_CONSTANTS.VIEWS.PAGE_TRANSLATION);
      mobileStore.setSheetState(MOBILE_CONSTANTS.SHEET_STATE.PEEK);
    }
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_PROGRESS, (detail) => {
    if (deviceDetector.isMobile()) {
      mobileStore.setPageTranslation({ 
        progress: detail.progress || 0,
        translatedCount: detail.translatedCount || 0
      });
    }
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_COMPLETE, (detail) => {
    if (deviceDetector.isMobile()) {
      mobileStore.setPageTranslation({ 
        isTranslating: false, 
        status: 'completed', 
        progress: 100,
        translatedCount: detail.translatedCount || mobileStore.pageTranslationData.translatedCount
      });
    }
  });

  tracker.addEventListener(pageEventBus, MessageActions.PAGE_TRANSLATE_ERROR, (detail) => {
    if (deviceDetector.isMobile()) {
      mobileStore.setPageTranslation({ isTranslating: false, status: 'error' });
    }
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

  if (deviceDetector.isMobile()) {
    window.removeEventListener('scroll', handleScroll);
    if (fabIdleTimer) clearTimeout(fabIdleTimer);
  }

  // Clean up settings listener
  if (tracker._toastSettingsCleanup) {
    tracker._toastSettingsCleanup();
    delete tracker._toastSettingsCleanup;
  }

  // Clear cancel timeout if exists
  if (cancelTimeout) {
    clearTimeout(cancelTimeout);
    cancelTimeout = null;
  }

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
  
    
  
  // Event listeners cleanup is now handled automatically by useResourceTracker
  // No manual cleanup needed!
});
</script>

<style>
/* Since this is in a Shadow DOM, these styles are completely isolated. */
.content-app-container {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483647 !important;
  pointer-events: none !important;
  display: block !important;
}

/* Individual components inside will override this (e.g., toaster, toolbars) */
.content-app-container > * {
  pointer-events: all !important; /* Re-enable pointer events for children */
}

.mobile-exit-selection {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: #fa5252;
  color: white;
  padding: 12px 20px;
  border-radius: 30px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 4px 12px rgba(250, 82, 82, 0.4);
  font-weight: 600;
  font-size: 16px;
  z-index: 2147483647;
  pointer-events: auto !important;
  cursor: pointer;
  animation: slide-up 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.mobile-exit-selection img {
  width: 18px;
  height: 18px;
  filter: brightness(0) invert(1);
}

.mobile-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  background: #339af0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(51, 154, 240, 0.4);
  z-index: 2147483647;
  pointer-events: auto !important;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.mobile-fab:active {
  transform: scale(0.85);
}

.mobile-fab img {
  width: 28px;
  height: 28px;
  filter: brightness(0) invert(1);
}

@keyframes slide-up {
  from { transform: translate(-50%, 100px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
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