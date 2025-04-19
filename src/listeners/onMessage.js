// src/listeners/onMessage.js

import Browser from "webextension-polyfill";
import { ErrorHandler } from "../services/ErrorService.js";
import { logME } from "../utils/helpers.js";
import { translateText } from "../utils/api.js";

import { tryInjectIfNeeded } from "../utils/injector.js";

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
// State managed centrally here and passed to relevant handlers
const selectElementStates = {};
// Wrap injectionInProgress in an object so handlers can modify it via reference
const injectionState = { inProgress: false };

// --- Service Initialization ---
const errorHandler = new ErrorHandler();

// --- Helper Functions (Consider moving to utils) ---
// These are defined here or imported from utils and passed to handlers

async function safeSendMessage(tabId, message) {
  try {
    const response = await Browser.tabs.sendMessage(tabId, message);
    return response;
  } catch (err) {
    if (
      err.message !==
        "The message port closed before a response was received." &&
      err.message !==
        "Could not establish connection. Receiving end does not exist."
    ) {
      logME("[Util:Messaging] safeSendMessage error:", err.message);
      return { error: err.message }; // Report other errors
    } else {
      logME(
        "[Util:Messaging] safeSendMessage: Port closed or no receiver (ignored)."
      );
      // Don't resolve, let caller handle timeout or lack of response
      return {}; // Or undefined, depending on how you want to signal this
    }
  }
}

// Popup
Browser.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    logME("Popup connected");

    // هنگامی که Popup بسته شد، رویداد disconnect اجرا می‌شود
    port.onDisconnect.addListener(() => {
      logME("Popup closed. Sending stopTTS action.");
      // انجام عملیات توقف TTS
      stopTTS();
    });
  }
});

// --- Main Message Listener (Dispatcher) ---
Browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const action = message?.action || message?.type;
  logME(`[Background:onMessage] Received action: ${action}`, {
    message,
    sender: { id: sender.id, url: sender.url, tab: sender.tab?.id },
  }); // Log sender info carefully

  if (!action) {
    logME(
      "[Background:onMessage] Received message without action/type.",
      message
    );
    sendResponse({ error: "Received message without action/type." });
    return false;
  }

  // if (message?.ping) {
  //   logME("[Background] Ping received to keep service worker alive");
  //   sendResponse({ pong: true }); // جواب بده تا error نده
  //   return true;
  // }

  // --- Action Router ---
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
      logME("[Background:onMessage] Received request to reload extension.");
      setTimeout(() => {
        try {
          // Browser.runtime.reload();
        } catch (error) {
          logME("[Background:onMessage] Error during reload:", error);
        }
      }, 100); // Add a small delay

      return false;

    case "getSelectedText":
      logME(
        "[Background:onMessage] Acknowledged sendSelectedTextResponse (no action)."
      );
      // Pass dependencies
      const selected_text = handleGetSelectedText(
        message,
        sender,
        sendResponse,
        safeSendMessage
      );

      sendResponse({ status: selected_text });
      return false; // Handler is async

    case "UPDATE_SELECT_ELEMENT_STATE":
      // Pass state object
      const update_element = handleUpdateSelectElementState(
        message,
        sender,
        selectElementStates
      );

      sendResponse({ status: update_element });

      return false; // Indicate synchronous response

    case "speak":
      playTTS(message)
        .then(() => sendResponse({ success: true }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message || "TTS error" })
        );
      return true;

    case "stopTTS":
      stopTTS();
      sendResponse({ success: true });
      return true;

    case "CONTENT_SCRIPT_WILL_RELOAD":
      logME("[Background:onMessage] Content script is about to reload.");
      // در اینجا می‌توانید هرگونه منطق مربوط به پاکسازی یا توقف انتظار برای پاسخ را انجام دهید
      return false; // نیازی به ارسال پاسخ نیست

    case "fetchTranslation":
      // Pass dependencies
      handleFetchTranslation(
        message,
        sender,
        sendResponse,
        translateText,
        errorHandler
      );
      return true; // Handler is async

    case "fetchTranslationBackground":
      // Pass dependencies
      handleFetchTranslationBackground(
        message,
        sender,
        sendResponse,
        translateText,
        errorHandler
      );
      return true; // Handler is async

    case "revertTranslation":
      // Pass dependencies
      handleRevertBackground();
      sendResponse({ success: true });
      return false; // Handler is async

    case "activateSelectElementMode":
      // Pass dependencies, including the injectionState object
      try {
        handleActivateSelectElementMode(
          message,
          sender,
          sendResponse,
          safeSendMessage,
          errorHandler,
          injectionState
        );
      } catch (error) {
        logME(
          "[Background:onMessage] Error in activateSelectElementMode:",
          error
        );
        sendResponse({
          error: error.message || "Failed to activate select element mode.",
        });
      }
      return true; // Handler is async

    case "TRY_INJECT_IF_NEEDED":
      // کروم نیاز داره اینجا به وضوح return Promise کنیم
      return new Promise((resolveOuter) => {
        tryInjectIfNeeded({
          tabId: message.tabId,
          url: message.url,
        })
          .then((result) => {
            try {
              sendResponse({ success: result });
            } catch (e) {
              logME("[onMessage] sendResponse failed:", e);
            }
            resolveOuter(); // بدون هیچ شرطی resolve بده
          })
          .catch((err) => {
            logME("[onMessage] tryInjectIfNeeded failed:", err);
            try {
              sendResponse({ success: false });
            } catch (e) {
              logME("[onMessage] sendResponse failed in catch:", e);
            }
            resolveOuter(); // حتما resolve
          });

        // کلاً یه timeout fail-safe برای Chrome بذاریم
        setTimeout(() => {
          try {
            sendResponse({ success: false, timeout: true });
          } catch (e) {}
          resolveOuter();
        }, 100); // اگه با این مقدار تاخیر جزیی sendResponse نشد، به زور بفرست
      });

    case "applyTranslationToActiveElement":
      logME(
        "[Background:onMessage] Forwarding to content script: applyTranslationToActiveElement"
      );

      // ارسال مستقیم به تب جاری که درخواست داده
      if (sender?.tab?.id) {
        safeSendMessage(sender.tab.id, message)
          .then((res) => {
            sendResponse(res);
          })
          .catch((err) => {
            logME(
              "[Background:onMessage] Error forwarding to content script:",
              err
            );
            sendResponse({
              success: false,
              error: err?.message || "Failed to apply translation.",
            });
          });

        return true;
      } else {
        sendResponse({
          success: false,
          error: "No valid tab to send message.",
        });
        return false;
      }

    default:
      logME("[Background:onMessage] Unhandled action:", action);
      return false;
  }
});

// --- Tab State Cleanup ---
Browser.tabs.onRemoved.addListener((tabId) => {
  if (selectElementStates.hasOwnProperty(tabId)) {
    delete selectElementStates[tabId];
    logME(
      `[Background:onMessage] Cleaned up selectElementState for closed tab ${tabId}`
    );
  }
});

// Log that this module has been loaded and the listener attached.
logME("[Background:onMessage] Listener attached (Dispatcher Mode).");
