// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";
import { createLogger } from "../utils/core/logger.js";
import { checkContentScriptAccess } from "../utils/core/tabPermissions.js";

// Create logger for content script
const logger = createLogger('Content', 'ContentScript');

// --- Early exit for restricted pages ---
const access = checkContentScriptAccess();

if (!access.isAccessible) {
  logger.warn(`Content script execution stopped: ${access.errorMessage}`);
  // Stop further execution by not initializing anything.
  // This prevents errors on pages like chrome://extensions or about:addons.
} else {
  (async () => {
    logger.init("Content script loading...");

    // Dynamically import modules only on accessible pages
    const { vueBridge } = await import("../managers/content/VueBridgeManager.js");
    const { contentTTSHandler } = await import("../handlers/content/TTSHandler.js");
    const { getTranslationHandlerInstance } = await import("../core/InstanceManager.js");
    const { SelectElementManager } = await import("../managers/content/SelectElementManager.js");
    const { contentMessageHandler } = await import("../handlers/content/ContentMessageHandler.js");
    const { shortcutManager } = await import("../managers/content/shortcuts/ShortcutManager.js");

    // Initialize core systems
    const translationHandler = getTranslationHandlerInstance();
    const eventCoordinator = translationHandler.eventCoordinator; // Use existing instance
    const selectElementManager = new SelectElementManager();

    // Store instances globally for handlers to access
    window.translationHandlerInstance = translationHandler;
    window.selectElementManagerInstance = selectElementManager;

    // Initialize all systems
    selectElementManager.initialize();
    contentMessageHandler.initialize();

    // Initialize TextFieldManager through EventCoordinator
    eventCoordinator.textFieldManager.initialize();

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

      const wasHandled = contentMessageHandler.handleMessage(message, sender, sendResponse);

      if (wasHandled !== false) {
        return true;
      }

      return false;
    });

    // Final initialization summary
    logger.init('Content script initialized', {
      messageHandlers: contentMessageHandler.getInfo?.()?.handlerCount || 0,
      shortcuts: shortcutManager.getShortcutsInfo?.()?.shortcutCount || 0,
      vueBridge: vueBridge.isInitialized,
      ttsHandler: !!contentTTSHandler
    });
  })();
}
