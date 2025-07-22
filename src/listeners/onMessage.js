// src/listeners/onMessage.js

import Browser from "webextension-polyfill";
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
import { playTTS, stopTTS } from "tts-player";
import { setupContextMenus } from "./onContextMenu.js";
import { openSidePanel } from "../sidepanel/action-helpers.js";

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

      case "translationAdded":
        // مستقیماً داده را ذخیره می‌کنیم
        Browser.storage.local
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

            Browser.storage.local.set({ translationHistory });
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
          safeSendMessage,
          errorHandler,
          injectionState
        );
        return true;

      case "applyTranslationToActiveElement": {
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

      case "OPEN_SIDE_PANEL": {
        // چون ممکن است از پاپ‌آپ فراخوانی شود، tabId را از sender می‌گیریم
        const tabId = sender.tab?.id;
        openSidePanel(tabId);
        return false; // نیازی به پاسخ نیست
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
      case "open_options_page": {
        openOptionsPage_from_Background(message);
        return false;
      }
      case "open_url": {
        const anchor = message.data?.anchor;
        const optionsUrl = Browser.runtime.getURL(
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
});

// Clean up per‑tab state
Browser.tabs.onRemoved.addListener((tabId) => {
  if (selectElementStates[tabId] != null) {
    delete selectElementStates[tabId];
    logME(`[onMessage] Cleaned state for tab ${tabId}`);
  }
});
