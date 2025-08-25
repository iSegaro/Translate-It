// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";
import { getScopedLogger } from "../utils/core/logger.js";
import { LOG_COMPONENTS } from "../utils/core/logConstants.js";
import { checkContentScriptAccess } from "../utils/core/tabPermissions.js";
import { MessageActions } from "../messaging/core/MessageActions.js";
import { sendReliable } from '@/messaging/core/ReliableMessaging.js';

// Import CSS styles for content script functionality
import "../styles/disable_links.css";

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
      const { mountContentApp } = await import("../views/content/main.js");
      const { pageEventBus } = await import("../utils/core/PageEventBus.js");
      // Import vue-sonner styles as a raw string to inject into the shadow DOM
      const sonnerStyles = await import('vue-sonner/style.css?raw');
      // Import TextFieldIcon styles as a raw string to inject into the shadow DOM
      const textFieldIconStyles = `
        .text-field-icon {
          position: absolute;
          width: 28px;
          height: 28px;
          background-color: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
          z-index: 2147483641; /* Just below the main container */
          transition: all 0.2s ease-in-out;
          opacity: 0;
          transform: scale(0.8);
          animation: fadeIn 0.2s forwards;
        }

        .text-field-icon:hover {
          background-color: #f5f5f5;
          transform: scale(1.1);
        }

        .text-field-icon svg {
          color: #5f6368;
        }

        @keyframes fadeIn {
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `;

      const hostElement = document.createElement('div');
      hostElement.id = 'translate-it-host';
      document.body.appendChild(hostElement);

      const shadowRoot = hostElement.attachShadow({ mode: 'open' });

      // Inject styles into the shadow DOM
      const styleEl = document.createElement('style');
      // This is a placeholder. In a real build process, this would be the bundled CSS.
      // For now, we can add some basic styles.
      styleEl.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        :host {
          font-family: 'Vazirmatn', sans-serif;
        }
        ${sonnerStyles.default}
        ${textFieldIconStyles}
      `;
      shadowRoot.appendChild(styleEl);

      const appRoot = document.createElement('div');
      shadowRoot.appendChild(appRoot);

      mountContentApp(appRoot);
      logger.info('Vue UI Host mounted into Shadow DOM.');

      // Emit a test event to confirm communication
      setTimeout(() => {
        pageEventBus.emit('ui-host-mounted');
      }, 500);

    } catch (error) {
      logger.error('Failed to mount the Vue UI Host:', error);
    }

    // Check if current page is excluded before initializing
    try {
      const response = await sendReliable({
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
    const { selectElementManager } = await import("../managers/content/select-element/SelectElementManager.js");
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
