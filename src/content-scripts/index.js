// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";
import { createLogger } from "../utils/core/logger.js";

// Import and initialize Vue bridge
import { vueBridge } from "../managers/content/VueBridgeManager.js";

// Import and initialize content script TTS handler
import { contentTTSHandler } from "../handlers/content/TTSHandler.js";

// Import NotificationManager
import NotificationManager from "../managers/core/NotificationManager.js";

// Import EventCoordinator and InstanceManager
import EventCoordinator from "../core/EventCoordinator.js";
import { getTranslationHandlerInstance } from "../core/InstanceManager.js";

// Import the new SelectElementManager
import { SelectElementManager } from "../managers/content/SelectElementManager.js";

// Import modular handlers and shortcuts
import { contentMessageHandler } from "../handlers/content/ContentMessageHandler.js";
import { shortcutManager } from "../managers/content/shortcuts/ShortcutManager.js";

// Create logger for content script
const logger = createLogger('Content', 'ContentScript');

logger.init("Content script loading...");

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
// Note: Keyboard shortcuts are now handled by ShortcutManager
document.addEventListener('mouseup', eventCoordinator.handleEvent, { passive: true });
document.addEventListener('click', eventCoordinator.handleEvent, { passive: true });
// Removed keydown listener - now handled by ShortcutManager
document.addEventListener('focus', eventCoordinator.handleEvent, { capture: true, passive: true });
document.addEventListener('blur', eventCoordinator.handleEvent, { capture: true, passive: true });

logger.debug('DOM event listeners registered');

// Setup message listener integration with existing system
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logger.debug('Message received', { action: message.action, from: message.context });

  // handleMessage returns false if no handler is found, or a promise if a handler is found.
  const wasHandled = contentMessageHandler.handleMessage(message, sender, sendResponse);

  // If a handler was found, wasHandled is a promise. We should return true
  // to indicate that we will send a response asynchronously.
  if (wasHandled !== false) {
    return true;
  }

  // No handler was found.
  return false;
});

// Final initialization summary
logger.init('Content script initialized', {
  messageHandlers: contentMessageHandler.getInfo?.()?.handlerCount || 0,
  shortcuts: shortcutManager.getShortcutsInfo?.()?.shortcutCount || 0,
  vueBridge: vueBridge.isInitialized,
  ttsHandler: !!contentTTSHandler
});