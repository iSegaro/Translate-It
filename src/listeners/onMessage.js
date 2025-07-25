// src/listeners/onMessage.js
// Cross-browser message listener with base listener architecture

import { BaseListener } from './base-listener.js';
import { getBrowserAPI } from '../utils/browser-unified.js';
import { ErrorHandler } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { matchErrorToType } from "../services/ErrorMatcher.js";
import {
  focusOrCreateTab,
  logME,
  openOptionsPage_from_Background,
} from "../utils/helpers.js";
import { translateText } from "../core/api.js";

// --- Import Handlers ---
import { handleExtensionLifecycle } from "../handlers/extensionLifecycleHandler.js";
import { handleGetSelectedText } from "../handlers/getSelectedTextHandler.js";
import { handleUpdateSelectElementState } from "../handlers/selectElementStatesHandler.js";
import {
  handleFetchTranslation,
  handleFetchTranslationBackground,
  handleRevertBackground,
} from "../handlers/backgroundHandlers.js";
import { handleActivateSelectElementMode } from "../handlers/elementModeHandler.js";
import { 
  handleStartAreaCapture,
  handleStartFullScreenCapture,
  handleRequestFullScreenCapture,
  handleProcessAreaCaptureImage,
  handlePreviewConfirmed,
  handlePreviewCancelled,
  handlePreviewRetry,
  handleResultClosed,
  handleCaptureError,
  handleAreaSelectionCancel
} from "../handlers/screenCaptureHandler.js";
import { setupContextMenus } from "./onContextMenu.js";

// --- State Management ---
const selectElementStates = {};
const injectionState = { inProgress: false };

// --- Service Initialization ---
const errorHandler = new ErrorHandler();

// --- Helper Functions ---
async function safeSendMessage(Browser, tabId, message) {
  try {
    return await Browser.tabs.sendMessage(tabId, message);
  } catch (err) {
    const msg = err.message || "";
    const errorType = matchErrorToType(err);
    
    // Handle extension context invalidation specifically
    if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
      logME("[onMessage] Extension context invalidated - content script connection lost");
      return { error: "Extension context invalidated" };
    }
    
    if (
      msg.includes("message port closed") ||
      msg.includes("Could not establish connection")
    ) {
      logME("[onMessage] No receiver (ignored).");
      return {};
    }
    
    logME("[onMessage] Error:", msg);
    return { error: msg };
  }
}

/**
 * Message Listener Class
 * Handles all runtime message events with proper error isolation
 */
class MessageListener extends BaseListener {
  constructor() {
    super('runtime', 'onMessage', 'Message Listener');
    this.browser = null;
  }

  async initialize() {
    await super.initialize();
    this.browser = await getBrowserAPI();
    
    // Set up popup connection handler
    this.setupPopupConnectionHandler();
    
    // Add main message handler
    this.addHandler(this.handleMessage.bind(this), 'main-message-handler');
  }

  /**
   * Set up popup connection handler for TTS cleanup
   */
  setupPopupConnectionHandler() {
    if (this.browser.runtime.onConnect) {
      this.browser.runtime.onConnect.addListener(async (port) => {
        if (port.name === "popup") {
          logME("[onMessage] Popup connected");
          
          port.onDisconnect.addListener(async () => {
            logME("[onMessage] Popup closed. Sending stopTTS.");
            await this.handleTTSStop();
          });
        }
      });
    }
  }

  /**
   * Handle TTS stop with dynamic import
   */
  async handleTTSStop() {
    try {
      // Use feature loader to get TTS manager
      const { featureLoader } = await import('../background/feature-loader.js');
      const ttsManager = await featureLoader.loadTTSManager();
      await ttsManager.stop();
    } catch (error) {
      logME("[onMessage] TTS not available in current context:", error);
    }
  }

  /**
   * Handle TTS speak with dynamic import
   */
  async handleTTSSpeak(message, sendResponse) {
    try {
      // Use feature loader to get TTS manager
      const { featureLoader } = await import('../background/feature-loader.js');
      const ttsManager = await featureLoader.loadTTSManager();
      
      // Speak with options from message
      await ttsManager.speak(message.text || message.message, {
        voice: message.voice,
        rate: message.rate,
        pitch: message.pitch,
        volume: message.volume,
        lang: message.lang
      });
      
      sendResponse({ success: true });
    } catch (error) {
      logME("[onMessage] TTS speak failed:", error);
      throw error;
    }
  }

  /**
   * Main message handler
   */
  async handleMessage(message, sender, sendResponse) {
  const action = message?.action || message?.type;
  logME(`[onMessage] Action: ${action}`, {
    message,
    sender: { id: sender.id, url: sender.url, tab: sender.tab?.id },
  });

  if (!action) {
    logME("[onMessage] No action/type provided. Messag: ", message);
    sendResponse({ error: "Missing action/type." });
    return false;
  }

  try {
    switch (action) {
      case "CONTEXT_INVALID":
      case "EXTENSION_RELOADED":
      case "restart_content_script":
        // Pass necessary dependencies to the handler
        return handleExtensionLifecycle(
          message,
          sender,
          sendResponse,
          errorHandler
        );

      case "BACKGROUND_RELOAD_EXTENSION":
        setTimeout(() => {
          try {
            // Browser.runtime.reload();
          } catch (e) {
            logME("[onMessage] Reload error:", e);
          }
        }, 100);
        return false;

      case "REFRESH_CONTEXT_MENUS":
        setupContextMenus()
          .then(() => {
            logME("[onMessage] Context menus refreshed successfully.");
            sendResponse({ success: true });
          })
          .catch((err) => {
            logME("[onMessage] Failed to refresh context menus:", err);
            sendResponse({ success: false, error: err.message });
          });
        return false; // Indicates an asynchronous response.

      case "getSelectedText":
        // handler itself will call sendResponse
        handleGetSelectedText(message, sender, sendResponse, (tabId, msg) => safeSendMessage(this.browser, tabId, msg));
        return true;

      case "UPDATE_SELECT_ELEMENT_STATE":
        handleUpdateSelectElementState(message, sender, selectElementStates);
        sendResponse({});
        return false;

      case "speak":
        (async () => {
          try {
            await this.handleTTSSpeak(message, sendResponse);
          } catch (error) {
            logME("[onMessage] TTS speak failed:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case "stopTTS":
        (async () => {
          try {
            await this.handleTTSStop();
            sendResponse({ success: true });
          } catch (error) {
            logME("[onMessage] TTS stop failed:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case "CONTENT_SCRIPT_WILL_RELOAD":
        logME("[onMessage] Content script will reload.");
        return false;

      case "fetchTranslation":
        handleFetchTranslation(
          message,
          sender,
          sendResponse,
          translateText,
          errorHandler
        );
        return true;

      case "translationAdded":
        // مستقیماً داده را ذخیره می‌کنیم
        this.browser.storage.local
          .get("translationHistory")
          .then(({ translationHistory = [] }) => {
            translationHistory.push({
              ...message.data,
              timestamp: Date.now(),
            });

            // حداکثر 100 آیتم نگه می‌داریم
            if (translationHistory.length > 100) {
              translationHistory.splice(0, translationHistory.length - 100);
            }

            this.browser.storage.local.set({ translationHistory });
          })
          .catch((err) => {
            logME("[Background] Error saving translation history:", err);
          });
        return false;

      case "fetchTranslationBackground":
        handleFetchTranslationBackground(
          message,
          sender,
          sendResponse,
          translateText,
          errorHandler
        );
        return true;

      case "revertTranslation":
        handleRevertBackground();
        sendResponse({ success: true });
        return false;

      case "activateSelectElementMode":
        handleActivateSelectElementMode(
          message,
          sender,
          sendResponse,
          (tabId, msg) => safeSendMessage(this.browser, tabId, msg),
          errorHandler,
          injectionState
        );
        return true;

      // Screen Capture Actions
      case "startAreaCapture":
        handleStartAreaCapture(
          message,
          sender,
          sendResponse,
          (tabId, msg) => safeSendMessage(this.browser, tabId, msg),
          errorHandler,
          injectionState
        );
        return true;

      case "startFullScreenCapture":
        handleStartFullScreenCapture(
          message,
          sender,
          sendResponse,
          (tabId, msg) => safeSendMessage(this.browser, tabId, msg),
          errorHandler,
          injectionState
        );
        return true;

      case "requestFullScreenCapture":
        handleRequestFullScreenCapture(
          message,
          sender,
          sendResponse,
          errorHandler
        );
        return true;

      case "processAreaCaptureImage":
        handleProcessAreaCaptureImage(
          message,
          sender,
          sendResponse,
          errorHandler
        );
        return true;

      case "previewConfirmed":
        handlePreviewConfirmed(
          message,
          sender,
          sendResponse,
          errorHandler
        );
        return true;

      case "previewCancelled":
        handlePreviewCancelled(message, sender, sendResponse);
        return false;

      case "previewRetry":
        handlePreviewRetry(
          message,
          sender,
          sendResponse,
          errorHandler
        );
        return true;

      case "resultClosed":
        handleResultClosed(message, sender, sendResponse);
        return false;

      case "captureError":
        handleCaptureError(message, sender, sendResponse);
        return false;

      case "areaSelectionCancel":
        handleAreaSelectionCancel(message, sender, sendResponse);
        return false;

      case "applyTranslationToActiveElement": {
        // ارسال مستقیم به تب جاری که درخواست داده
        if (sender.tab?.id) {
          safeSendMessage(this.browser, sender.tab.id, message)
            .then((res) => sendResponse(res))
            .catch((e) => {
              logME("[onMessage] Forward error:", e);
              sendResponse({ success: false, error: e.message });
            });
          return true;
        }
        sendResponse({ success: false, error: "No valid tab." });
        return false;
      }

      case "OPEN_SIDE_PANEL": {
        // TODO: Implement openSidePanel functionality for Vue migration
        // چون ممکن است از پاپ‌آپ فراخوانی شود، tabId را از sender می‌گیریم
        const tabId = sender.tab?.id;
        // openSidePanel(tabId);
        console.log('OPEN_SIDE_PANEL called for tab:', tabId);
        return false; // نیازی به پاسخ نیست
      }

      case "show_os_notification": {
        const { title, message: msg } = message.payload;
        if (this.browser.notifications && msg) {
          this.browser.notifications
            .create({
              type: "basic",
              iconUrl: this.browser.runtime.getURL("icons/extension_icon_128.png"), // Use a specific size
              title: title || "Translate It!",
              message: msg,
            })
            .catch((err) => {
              logME("[onMessage] OS notification creation failed:", err);
            });
        }
        // No response needed, this is a fire-and-forget action.
        return false;
      }
      case "open_options_page": {
        openOptionsPage_from_Background(message);
        return false;
      }
      case "open_url": {
        const anchor = message.data?.anchor;
        const optionsUrl = this.browser.runtime.getURL(
          `html/options.html${anchor ? `#${anchor}` : ""}`
        );
        focusOrCreateTab(optionsUrl);
        return true;
      }

      default:
        logME("[onMessage]Unhandled action:", action);
        return false;
    }
  } catch (err) {
    errorHandler.handle(err, {
      type: ErrorTypes.SERVICE,
      context: "background-onMessage",
    });
    sendResponse({ error: err.message });
    return false;
  }
  }
}

// Create and initialize the message listener
const messageListener = new MessageListener();

// Initialize and register the listener
messageListener.initialize().then(() => {
  messageListener.register();
  console.log('✅ Message listener initialized and registered');
}).catch(error => {
  console.error('❌ Failed to initialize message listener:', error);
});

// Set up tab cleanup listener
class TabCleanupListener extends BaseListener {
  constructor() {
    super('tabs', 'onRemoved', 'Tab Cleanup Listener');
  }

  async initialize() {
    await super.initialize();
    this.addHandler(this.handleTabRemoved.bind(this), 'tab-cleanup-handler');
  }

  async handleTabRemoved(tabId) {
    if (selectElementStates[tabId] != null) {
      delete selectElementStates[tabId];
      logME(`[onMessage] Cleaned state for tab ${tabId}`);
    }
  }
}

// Initialize tab cleanup listener
const tabCleanupListener = new TabCleanupListener();
tabCleanupListener.initialize().then(() => {
  tabCleanupListener.register();
  console.log('✅ Tab cleanup listener initialized and registered');
}).catch(error => {
  console.error('❌ Failed to initialize tab cleanup listener:', error);
});

// Export listeners for cleanup if needed
export { messageListener, tabCleanupListener };
