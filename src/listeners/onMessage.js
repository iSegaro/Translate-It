// src/listeners/onMessage.js

import Browser from "webextension-polyfill";
import { ErrorHandler } from "../services/ErrorService.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { logME } from "../utils/helpers.js";
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
import { playTTS, stopTTS } from "../backgrounds/tts-player.js";

// --- State Management ---
const selectElementStates = {};
const injectionState = { inProgress: false };

// --- Service Initialization ---
const errorHandler = new ErrorHandler();

// --- Helper Functions ---
async function safeSendMessage(tabId, message) {
  try {
    return await Browser.tabs.sendMessage(tabId, message);
  } catch (err) {
    const msg = err.message || "";
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

// Popup connection
Browser.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    logME("[onMessage] Popup connected");
    // هنگامی که Popup بسته شد، رویداد disconnect اجرا می‌شود
    port.onDisconnect.addListener(() => {
      logME("[onMessage] Popup closed. Sending stopTTS.");
      stopTTS();
    });
  }
});

// --- Main Dispatcher ---
Browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

      case "getSelectedText":
        // handler itself will call sendResponse
        handleGetSelectedText(message, sender, sendResponse, safeSendMessage);
        return true;

      case "UPDATE_SELECT_ELEMENT_STATE":
        handleUpdateSelectElementState(message, sender, selectElementStates);
        sendResponse({});
        return false;

      case "speak":
        playTTS(message)
          .then(() => sendResponse({ success: true }))
          .catch((error) =>
            sendResponse({ success: false, error: error.message })
          );
        return true;

      case "stopTTS":
        stopTTS();
        sendResponse({ success: true });
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
          safeSendMessage,
          errorHandler,
          injectionState
        );
        return true;

      case "applyTranslationToActiveElement":{
        // ارسال مستقیم به تب جاری که درخواست داده
        if (sender.tab?.id) {
          safeSendMessage(sender.tab.id, message)
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

      case "show_os_notification": {
        const { title, message: msg } = message.payload;
        if (Browser.notifications && msg) {
          Browser.notifications
            .create({
              type: "basic",
              iconUrl: Browser.runtime.getURL("icons/extension_icon_128.png"), // Use a specific size
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
});

// Clean up per‑tab state
Browser.tabs.onRemoved.addListener((tabId) => {
  if (selectElementStates[tabId] != null) {
    delete selectElementStates[tabId];
    logME(`[onMessage] Cleaned state for tab ${tabId}`);
  }
});