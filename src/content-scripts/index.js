// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";
import { getScopedLogger } from "../utils/core/logger.js";
import { LOG_COMPONENTS } from "../utils/core/logConstants.js";
import { checkContentScriptAccess } from "../utils/core/tabPermissions.js";
import { MessageActions } from "../messaging/core/MessageActions.js";
import { sendSmart } from '@/messaging/core/SmartMessaging.js';


// Create logger for content script
const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScript');

// --- Early exit for restricted pages ---
const access = checkContentScriptAccess();

if (!access.isAccessible) {
  logger.warn(`Content script execution stopped: ${access.errorMessage}`);
  // Stop further execution by not initializing anything.
  // This prevents errors on pages like chrome://extensions or about:addons.
} else {
  (async () => {
    logger.init("Content script loading...");

    // --- Mount the Vue UI Host ---
    try {
      const { mountContentApp, getAppCss } = await import("../app/main.js");
      const { pageEventBus } = await import("../utils/core/PageEventBus.js");
      
      // 1. Inject page-level styles directly into the document head.
      const pageStyles = await import('../styles/page-styles.css?raw');
      const pageStyleEl = document.createElement('style');
      pageStyleEl.textContent = pageStyles.default;
      document.head.appendChild(pageStyleEl);
      
      // 2. Create the host element and shadow DOM.
      const hostElement = document.createElement('div');
      hostElement.id = 'translate-it-host';
      hostElement.style.all = 'initial';
      document.body.appendChild(hostElement);
      const shadowRoot = hostElement.attachShadow({ mode: 'open' });

      // 3. Inject the entire app's CSS into the shadow DOM.
      const appStyles = getAppCss();
      const appStyleEl = document.createElement('style');
      appStyleEl.setAttribute('data-vue-shadow-styles', 'true');
      
      // Include Google Font import and all app styles
      appStyleEl.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        
        /* App styles with Shadow DOM reset included */
        ${appStyles}
      `;
      shadowRoot.appendChild(appStyleEl);
      
      // Debug: Log the amount of CSS injected
      console.log('[Content Script] Injected CSS length:', appStyles.length, 'characters');
      
      // Debug: Check if specific styles are present
      if (appStyles.includes('.translation-window')) {
        console.log('[Content Script] ✅ TranslationWindow styles found in injected CSS');
      } else {
        console.warn('[Content Script] ⚠️ TranslationWindow styles NOT found in injected CSS');
      }
      
      if (appStyles.includes('background')) {
        console.log('[Content Script] ✅ Background styles found in injected CSS');
      } else {
        console.warn('[Content Script] ⚠️ Background styles NOT found in injected CSS');
      }

      // 4. Create the root element for the Vue app and mount it.
      const appRoot = document.createElement('div');
      shadowRoot.appendChild(appRoot);
      mountContentApp(appRoot);

      logger.info('Vue UI Host mounted into Shadow DOM with all styles.');

      // Emit a test event to confirm communication
      setTimeout(() => {
        pageEventBus.emit('ui-host-mounted');
      }, 500);

    } catch (error) {
      logger.error('Failed to mount the Vue UI Host:', error);
    }

    // Check if current page is excluded before initializing
    try {
      const response = await sendSmart({
        action: MessageActions.IS_Current_Page_Excluded,
        data: { url: window.location.href }
      });
      
      if (response?.excluded) {
        logger.info(`Content script stopped: page ${window.location.hostname} is excluded`);
        return; // Stop initialization if page is excluded
      }
    } catch (error) {
      logger.error('Failed to check page exclusion status:', error);
      // Continue with initialization on error to avoid breaking functionality
    }

    // Dynamically import modules only on accessible and non-excluded pages
    const { vueBridge } = await import("../managers/content/VueBridgeManager.js");
    // TTS handler removed - using unified GOOGLE_TTS_SPEAK system
    const { getTranslationHandlerInstance } = await import("../core/InstanceManager.js");
    const { selectElementManager } = await import("@/features/element-selection/managers/SelectElementManager.js");
    const { contentMessageHandler } = await import("../handlers/content/ContentMessageHandler.js");
    const { shortcutManager } = await import("../managers/content/shortcuts/ShortcutManager.js");
    const { initializeSubtitleHandler } = await import("../managers/content/SubtitleInitializer.js");

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();
    const eventCoordinator = translationHandler.eventCoordinator; // Use existing instance

    // Store instances globally for handlers to access
    window.translationHandlerInstance = translationHandler;
    window.selectElementManagerInstance = selectElementManager;

    // Give ContentMessageHandler a reference to SelectElementManager
    contentMessageHandler.setSelectElementManager(selectElementManager);

    // Initialize subtitle handler conditionally
    await initializeSubtitleHandler(translationHandler);

    // Initialize all systems
    selectElementManager.initialize();
    contentMessageHandler.initialize();

    // Initialize TextFieldManager through EventCoordinator with proper dependencies
    eventCoordinator.textFieldManager.initialize({
      translationHandler: translationHandler,
      notifier: translationHandler.notifier,
      strategies: translationHandler.strategies,
      featureManager: translationHandler.featureManager
    });

    // Initialize shortcut manager with required dependencies
    shortcutManager.initialize({
      translationHandler: translationHandler,
      featureManager: translationHandler.featureManager
    });

    // Setup DOM event listeners for EventCoordinator (text selection, text fields)
    document.addEventListener('mouseup', eventCoordinator.handleEvent, { passive: true });
    document.addEventListener('click', eventCoordinator.handleEvent, { passive: true });
    document.addEventListener('focus', eventCoordinator.handleEvent, { capture: true, passive: true });
    document.addEventListener('blur', eventCoordinator.handleEvent, { capture: true, passive: true });

    logger.debug('DOM event listeners registered');

    // Setup message listener integration with existing system
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      logger.debug('Message received', { action: message.action, from: message.context });

      // Handle exclusion updates immediately
      if (message.action === MessageActions.Set_Exclude_Current_Page && message.data?.exclude) {
        logger.info('Page excluded via popup - disabling extension functionality');
        // Could add cleanup logic here if needed
        return Promise.resolve({ success: true });
      }

      // Handle async message processing
      const handleAsync = async () => {
        try {
          const wasHandled = await contentMessageHandler.handleMessage(message, sender, sendResponse);
          return wasHandled; // Return the actual handling result
        } catch (error) {
          logger.error('Message handling error:', error);
          if (sendResponse) {
            sendResponse({ success: false, error: error.message });
          }
          return true; // Indicate handled (even if error)
        }
      };

      // For async handlers, we need to return true and handle response manually
      if (contentMessageHandler.handlers.has(message.action)) {
        handleAsync();
        return true; // Keep message channel open for async response
      }

      return false; // Let other handlers process
    });

    // Final initialization summary
    logger.init('Content script initialized', {
      messageHandlers: contentMessageHandler.getInfo?.()?.handlerCount || 0,
      shortcuts: shortcutManager.getShortcutsInfo?.()?.shortcutCount || 0,
      vueBridge: vueBridge.isInitialized,
      ttsHandler: true  // Using unified GOOGLE_TTS_SPEAK system
    });
  })();
}
