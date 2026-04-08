import { onMounted, onUnmounted } from 'vue';
import browser from 'webextension-polyfill';
import { ToastIntegration } from '@/shared/toast/ToastIntegration.js';
import NotificationManager from '@/core/managers/core/NotificationManager.js';
import { getSelectElementNotificationManager } from '@/features/element-selection/SelectElementNotificationManager.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { WINDOWS_MANAGER_EVENTS } from '@/core/PageEventBus.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT_APP, 'useContentAppLifecycle');

/**
 * Composable for managing the lifecycle of the ContentApp.
 * Handles initialization of settings, managers, and cleanup on navigation.
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.settingsStore - The settings store instance
 * @param {Object} options.tracker - Resource tracker for event listeners
 * @param {Function} options.updateToastRTL - Function to initialize RTL
 * @param {Function} options.onNavigationCleanup - Callback for navigation cleanup
 * @returns {Object} Lifecycle state and methods
 */
export function useContentAppLifecycle({ 
  settingsStore, 
  tracker, 
  updateToastRTL,
  onNavigationCleanup 
}) {
  let toastIntegration = null;
  let selectElementNotificationManager = null;

  /**
   * Initializes all required managers and services
   */
  const initializeApp = async () => {
    logger.info('ContentApp: initialization started');
    
    // 1. Ensure settings are loaded
    if (!settingsStore.isInitialized) {
      logger.debug('ContentApp: Loading settings store...');
      await settingsStore.loadSettings();
      logger.debug('ContentApp: Settings store loaded');
    }

    const pageEventBus = window.pageEventBus;
    if (!pageEventBus) return;

    // 2. Initialize Toast Integration
    try {
      logger.debug('ContentApp: Initializing ToastIntegration...');
      toastIntegration = ToastIntegration.createSingleton(pageEventBus);
      toastIntegration.initialize();
      logger.debug('ContentApp: ToastIntegration initialized');
    } catch (error) {
      logger.warn('ToastIntegration initialization failed:', error);
    }

    // 3. Initialize SelectElement Notification Manager
    try {
      logger.debug('ContentApp: Initializing SelectElementNotificationManager...');
      const notificationManager = new NotificationManager();
      selectElementNotificationManager = await getSelectElementNotificationManager(notificationManager);
      logger.debug('ContentApp: SelectElementNotificationManager initialized');
    } catch (error) {
      logger.warn('Failed to initialize SelectElementNotificationManager:', error);
    }

    // 4. CRITICAL: Initialize RTL for toasts
    if (updateToastRTL) {
      await updateToastRTL();
      logger.debug('ContentApp: RTL initialized');
    }
  };

  /**
   * Sets up general application event listeners
   */
  const setupGeneralListeners = () => {
    const pageEventBus = window.pageEventBus;
    if (!pageEventBus) return;

    // Open Options Page
    tracker.addEventListener(pageEventBus, WINDOWS_MANAGER_EVENTS.OPEN_SETTINGS, (detail) => {
      logger.info('Received open-options-page event:', detail);
      const anchor = detail?.section || detail?.anchor;
      
      browser.runtime.sendMessage({
        action: MessageActions.OPEN_OPTIONS_PAGE,
        data: { anchor }
      }).catch(err => logger.error('Error opening options page:', err));
    });

    // Navigation Cleanup
    tracker.addEventListener(pageEventBus, 'navigation-detected', (detail) => {
      logger.info('Navigation detected, cleaning up UI state:', detail);
      if (onNavigationCleanup) {
        onNavigationCleanup(detail);
      }
    });

    // Mounted Test Event
    tracker.addEventListener(pageEventBus, 'ui-host-mounted', () => {
      logger.info('Successfully received the ui-host-mounted test event!');
    });
  };

  onMounted(async () => {
    await initializeApp();
    setupGeneralListeners();
    logger.debug('ContentApp Lifecycle: initialization complete');
  });

  onUnmounted(async () => {
    logger.info('ContentApp Lifecycle: unmounting component');

    // Shutdown toast integration
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
        const { SelectElementNotificationManager } = await import('@/features/element-selection/SelectElementNotificationManager.js');
        SelectElementNotificationManager.clearInstance();
      }
    } catch (error) {
      logger.warn('Error cleaning up SelectElementNotificationManager:', error);
    }
  });

  return {
    toastIntegration,
    selectElementNotificationManager
  };
}
