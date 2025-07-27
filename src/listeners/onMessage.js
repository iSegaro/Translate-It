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
    const response = await Browser.tabs.sendMessage(tabId, message);
    return { success: true, data: response };
  } catch (err) {
    const msg = err.message || "";
    const errorType = matchErrorToType(err);
    
    // Handle extension context invalidation specifically
    if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED) {
      logME("[onMessage] Extension context invalidated - content script connection lost");
      return { success: false, error: "Extension context invalidated" };
    }
    
    if (
      msg.includes("message port closed") ||
      msg.includes("Could not establish connection")
    ) {
      logME("[onMessage] No receiver (ignored).");
      return { success: false, error: msg };
    }
    
    logME("[onMessage] Error:", msg);
    return { success: false, error: msg };
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
   * Override the base listener's register method to properly handle Chrome extension message listeners
   */
  async register() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isRegistered) {
      console.log(`🔄 ${this.listenerName} listener already registered`);
      return;
    }

    try {
      const eventTarget = this.browser[this.eventType];
      if (!eventTarget) {
        throw new Error(`Browser API ${this.eventType} not available`);
      }

      const eventObject = eventTarget[this.eventName];
      if (!eventObject) {
        throw new Error(`Event ${this.eventName} not available on ${this.eventType}`);
      }

      // For message listeners, we need to handle the return value properly
      // Chrome extension message listeners need to return true to keep the response channel open
      eventObject.addListener((message, sender, sendResponse) => {
        console.debug(`📨 ${this.listenerName} event received, calling ${this.handlers.length} handlers`);
        
        // Call the main message handler directly and return its result
        // This preserves the synchronous return value needed for Chrome extensions
        if (this.handlers.length > 0) {
          const handler = this.handlers[0]; // We only have one handler for messages
          try {
            const result = handler.fn(message, sender, sendResponse);
            return result; // This is crucial - return the handler's result to Chrome
          } catch (error) {
            console.error(`❌ Handler "${handler.name}" failed:`, error);
            sendResponse({ success: false, error: error.message });
            return false;
          }
        }
        
        return false;
      });

      this.isRegistered = true;
      console.log(`✅ Registered ${this.listenerName} listener`);

    } catch (error) {
      console.error(`❌ Failed to register ${this.listenerName} listener:`, error);
      throw error;
    }
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
   * Handle simple TTS speak - based on OLD implementation
   */
  async handleSimpleTTSSpeak(message, sendResponse) {
    try {
      logME("[onMessage] Simple TTS speak request:", { text: message.text?.substring(0, 30), lang: message.lang });
      
      // Import TTS player dynamically like OLD version
      const { playTTS } = await import('../utils/tts-player/tts-player.js');
      
      // Call playTTS with message (same as OLD pattern)
      await playTTS(message);
      
      sendResponse({ success: true });
      logME("[onMessage] Simple TTS speak completed successfully");
      
    } catch (error) {
      logME("[onMessage] Simple TTS speak failed:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle cached TTS speak - uses cache layer in tts-player.js
   */
  async handleCachedTTSSpeak(message, sendResponse) {
    try {
      logME("[onMessage] Cached TTS speak request:", { text: message.text?.substring(0, 30), lang: message.lang });
      
      // Import TTS player dynamically for cache layer
      const { playTTS } = await import('../utils/tts-player/tts-player.js');
      
      // Use cache layer directly (single path to offscreen)
      await playTTS(message);
      
      sendResponse({ success: true });
      logME("[onMessage] Cached TTS speak completed successfully");
      
    } catch (error) {
      logME("[onMessage] Cached TTS speak failed:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle simple TTS stop - based on OLD implementation  
   */
  async handleSimpleTTSStop(sendResponse) {
    try {
      logME("[onMessage] Simple TTS stop request");
      
      // Import TTS player dynamically like OLD version
      const { stopTTS } = await import('../utils/tts-player/tts-player.js');
      
      // Call stopTTS (same as OLD pattern)
      stopTTS();
      
      sendResponse({ success: true });
      logME("[onMessage] Simple TTS stop completed successfully");
      
    } catch (error) {
      logME("[onMessage] Simple TTS stop failed:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Handle cached audio playback via offscreen document (with auto-recreation support)
   */
  async handlePlayCachedAudio(message, sendResponse) {
    try {
      logME("[onMessage] Cached audio playback request:", message.audioData?.length, "bytes");
      
      if (!message.audioData || !Array.isArray(message.audioData)) {
        throw new Error("Invalid audio data provided");
      }

      // Convert array back to Uint8Array and create blob
      const audioBuffer = new Uint8Array(message.audioData);
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });

      // Try multiple approaches with auto-recreation
      let lastError = null;
      
      // Attempt 1: Use TTS Manager with auto-recreation
      try {
        const { featureLoader } = await import('../background/feature-loader.js');
        const ttsManager = await featureLoader.loadTTSManager();
        
        // Try to recreate offscreen if needed before playback
        if (typeof ttsManager.recreateOffscreenIfNeeded === 'function') {
          logME("[onMessage] Ensuring offscreen is ready for cached audio playback");
          const isReady = await ttsManager.recreateOffscreenIfNeeded();
          if (!isReady) {
            throw new Error("Offscreen document not available and recreation failed");
          }
        }
        
        // Use TTS Manager to play via offscreen
        if (typeof ttsManager.playAudioBlob === 'function') {
          await ttsManager.playAudioBlob(audioBlob);
        } else {
          throw new Error("TTS Manager doesn't support audio blob playback");
        }
        
        sendResponse({ success: true });
        logME("[onMessage] Cached audio playback completed via TTS Manager");
        return;
        
      } catch (ttsError) {
        lastError = ttsError;
        logME("[onMessage] TTS Manager playback failed:", ttsError.message);
      }
      
      // Attempt 2: Direct offscreen message with manual recreation check
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          logME("[onMessage] Attempting direct offscreen playback");
          
          const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({
              action: 'playOffscreenAudio',
              audioData: message.audioData,
              fromCachedPlayback: true
            }, (response) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(response);
              }
            });
          });
          
          if (response && response.success) {
            sendResponse({ success: true });
            logME("[onMessage] Cached audio playback completed via direct offscreen");
            return;
          } else {
            throw new Error(response?.error || "Direct offscreen playback failed");
          }
        } else {
          throw new Error("Chrome runtime not available for offscreen playback");
        }
        
      } catch (directError) {
        lastError = directError;
        logME("[onMessage] Direct offscreen playback failed:", directError.message);
      }
      
      // All methods failed
      throw lastError || new Error("All cached audio playback methods failed");
      
    } catch (error) {
      logME("[onMessage] Cached audio playback failed:", error);
      sendResponse({ success: false, error: error.message });
    }
  }

  /**
   * Main message handler
   */
  handleMessage(message, sender, sendResponse) {
  console.log(`[onMessage] Raw message received:`, message);
  const action = message?.action || message?.type;
  
  // Ignore messages forwarded from offscreen to prevent loops
  if (message.forwardedFromOffscreen) {
    logME('[onMessage] Ignoring message forwarded from offscreen:', action);
    return false;
  }

  // Prioritize messages with explicit background target
  if (message.target === 'background') {
    logME(`[onMessage] Processing background-targeted message: ${action}`);
  }
  
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
        // New: Route through tts-player.js cache layer (single path)
        this.handleCachedTTSSpeak(message, sendResponse);
        return true;

      case "stopTTS":
        // Only handle stopTTS messages with explicit background target or no target
        if (!message.target || message.target === 'background') {
          this.handleSimpleTTSStop(sendResponse);
          return true;
        }
        return false;

      case "playCachedAudio":
        // Handle cached audio playback via offscreen document
        this.handlePlayCachedAudio(message, sendResponse);
        return true;

      case "ping":
        logME("[onMessage] Ping received, responding with pong");
        sendResponse({ success: true, message: "pong" });
        return false;

      case "CONTENT_SCRIPT_WILL_RELOAD":
        logME("[onMessage] Content script will reload.");
        return false;

      case "fetchTranslation":
        logME("[onMessage] Calling handleFetchTranslation");
        
        // Create a safe sendResponse wrapper that can only be called once
        let responseAlreadySent = false;
        let responseTimer = null;
        
        const safeSendResponse = (response) => {
          if (responseAlreadySent) {
            logME("[onMessage] WARNING: sendResponse already called, ignoring:", response);
            return;
          }
          responseAlreadySent = true;
          
          // Clear the timeout if response is sent
          if (responseTimer) {
            clearTimeout(responseTimer);
            responseTimer = null;
          }
          
          logME("[onMessage] Sending response:", response);
          sendResponse(response);
        };
        
        // Set a timeout to ensure response is always sent
        responseTimer = setTimeout(() => {
          if (!responseAlreadySent) {
            logME("[onMessage] Translation timeout, sending default error response");
            safeSendResponse({ success: false, error: 'Translation timeout' });
          }
        }, 30000); // 30 seconds timeout
        
        handleFetchTranslation(
          message,
          sender,
          safeSendResponse,
          translateText,
          errorHandler
        ).catch(error => {
          logME("[onMessage] handleFetchTranslation promise rejected:", error);
          if (!responseAlreadySent) {
            safeSendResponse({ success: false, error: error.message || 'Translation failed' });
          }
        });
        
        logME("[onMessage] handleFetchTranslation called, returning true");
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

      case "elementSelected":
        // Forward element selection data to sidepanel
        logME("[onMessage] Element selected, forwarding to sidepanel");
        // This will be handled by Vue composable listeners
        sendResponse({ success: true }); // Send a success response back to content script
        return true; // Keep channel open for async response

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
