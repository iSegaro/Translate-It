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

      const translationWindowStyles = `
.translation-window {
  width: 350px;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  font-family: 'Vazirmatn', sans-serif;
  opacity: 0;
  transform: scale(0.95);
  transition: opacity 0.2s ease, transform 0.2s ease;
  visibility: hidden;
}

.translation-window.visible {
    opacity: 1;
    transform: scale(1);
    visibility: visible;
}

.translation-window.light {
  background-color: #ffffff;
  border: 1px solid #e8e8e8;
  color: #2c3e50;
}

.translation-window.light .window-header {
  background-color: #f7f7f7;
  border-bottom: 1px solid #e8e8e8;
}

.translation-window.light .header-title {
  color: #6c757d;
}

.translation-window.light .action-btn {
  background-color: #f0f0f0;
  color: #555;
}

.translation-window.light .action-btn:hover {
  background-color: #e5e5e5;
}

.translation-window.light .original-text {
  color: #6c757d;
  background-color: #fdfdfd;
  border-color: #f0f0f0;
}

.translation-window.light .translated-text {
  color: #2c3e50;
}

.translation-window.light .spinner {
  border-color: rgba(0, 0, 0, 0.1);
  border-top-color: #444;
}

.translation-window.dark {
  background-color: #2d2d2d;
  border: 1px solid #424242;
  color: #e0e0e0;
}

.translation-window.dark .window-header {
  background-color: #333333;
  border-bottom: 1px solid #424242;
}

.translation-window.dark .header-title {
  color: #bdbdbd;
}

.translation-window.dark .action-btn {
  background-color: #424242;
  color: #e0e0e0;
}

.translation-window.dark .action-btn:hover {
  background-color: #555555;
}

.translation-window.dark .original-text {
  color: #bdbdbd;
  background-color: #333333;
  border-color: #424242;
}

.translation-window.dark .translated-text {
  color: #e0e0e0;
}

.translation-window.dark .spinner {
  border-color: rgba(255, 255, 255, 0.2);
  border-top-color: #f5f5f5;
}

.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: move;
  user-select: none;
}

.header-title {
  font-weight: 500;
  font-size: 14px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.window-body {
  padding: 16px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
}

.loading-container, .error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-grow: 1;
  text-align: center;
}

.spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border-width: 3px;
  border-style: solid;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.translation-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.original-text {
  font-size: 14px;
  padding: 8px;
  border-radius: 4px;
  border-right: 3px solid;
}

.translated-text {
  font-size: 16px;
  line-height: 1.6;
  white-space: pre-wrap;
}
      `;

      const hostElement = document.createElement('div');
      hostElement.id = 'translate-it-host';
      hostElement.style.all = 'initial';
      document.body.appendChild(hostElement);

      const shadowRoot = hostElement.attachShadow({ mode: 'open' });

      // Inject styles into the shadow DOM
      const styleEl = document.createElement('style');
      // Import disable_links.css styles into shadow DOM
      const disableLinksStyles = await import("../styles/disable_links.css?raw");
      // This is a placeholder. In a real build process, this would be the bundled CSS.
      // For now, we can add some basic styles.
      styleEl.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;700&display=swap');
        :host {
          font-family: 'Vazirmatn', sans-serif;
        }
        ${sonnerStyles.default}
        ${textFieldIconStyles}
        ${disableLinksStyles.default}
        ${translationWindowStyles}
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
