// Content script entry point for Vue build
// Modern modular architecture with organized handlers and shortcuts

import browser from "webextension-polyfill";

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

console.log("Content script loaded via Vue build system");
console.log("Vue bridge initialized:", vueBridge.isInitialized);
console.log("Content TTS Handler loaded:", !!contentTTSHandler);

// Initialize core systems
const translationHandler = getTranslationHandlerInstance();
const eventCoordinator = new EventCoordinator(translationHandler, translationHandler.featureManager);
const selectElementManager = new SelectElementManager();

// Store instances globally for handlers to access
window.translationHandlerInstance = translationHandler;
window.selectElementManagerInstance = selectElementManager;

// Initialize all systems
selectElementManager.initialize();
contentMessageHandler.initialize();

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

console.log('✅ DOM event listeners setup for EventCoordinator (modern event routing)');

// Setup message listener integration with existing system
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  console.log('[ContentScript] Received message:', message);
  
  // Try content message handler first
  const handled = await contentMessageHandler.handleMessage(message, sender, sendResponse);
  
  if (handled !== false) {
    return handled;
  }
  
  // Let other handlers process the message
  return false;
});

console.log("✅ Content script initialized with modular architecture:");
console.log("  - Content Message Handler:", contentMessageHandler.getInfo());
console.log("  - Shortcut Manager:", shortcutManager.getShortcutsInfo());