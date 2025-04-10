// src/listeners/onMessage.js

import Browser from "webextension-polyfill";
import { ErrorHandler } from "../services/ErrorService.js";
import { logME } from "../utils/helpers.js";
import { translateText } from "../utils/api.js";

// --- Import Handlers ---
import { handleExtensionLifecycle } from "../handlers/extensionLifecycleHandler.js";
import { handleGetSelectedText } from "../handlers/getSelectedTextHandler.js";
import { handleUpdateSelectElementState } from "../handlers/selectElementStatesHandler.js";
import { handlePlayGoogleTTS } from "../handlers/ttsHandler.js";
import {
  handleFetchTranslation,
  handleFetchTranslationBackground,
} from "../handlers/translationHandler.js";
import { handleActivateSelectElementMode } from "../handlers/elementModeHandler.js";
import { AUTO_DETECT_VALUE, playAudioGoogleTTS } from "../utils/tts.js";
import { playTTS } from "../backgrounds/tts-player.js";
import { playAudioViaOffscreen } from "../backgrounds/tts-player.js";

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
          console.error("[Background:onMessage] Error during reload:", error);
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
      playTTS(message.text)
        .then(() => sendResponse({ success: true }))
        .catch((err) =>
          sendResponse({ success: false, error: err.message || "TTS error" })
        );
      return true; // نگه داشتن listener تا ارسال پاسخ

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

    case "playGoogleTTS":
      // Pass dependencies
      try {
        if (
          typeof Browser !== "undefined" &&
          Browser.runtime &&
          Browser.runtime.getBrowserInfo
        ) {
          Browser.runtime
            .getBrowserInfo()
            .then((browserInfo) => {
              const isFirefox = browserInfo.name.toLowerCase() === "firefox";
              if (isFirefox) {
                playAudioGoogleTTS(
                  message.text,
                  AUTO_DETECT_VALUE,
                  sendResponse
                );
              } else {
                handlePlayGoogleTTS(
                  message,
                  sender,
                  sendResponse,
                  playAudioViaOffscreen,
                  errorHandler
                );
              }
            })
            .catch((error) => {
              console.error(
                "[Background:onMessage] Error getting browser info:",
                error
              );
              handlePlayGoogleTTS(
                message,
                sender,
                sendResponse,
                playAudioViaOffscreen,
                errorHandler
              );
            });
        } else if (typeof chrome !== "undefined" && chrome.runtime) {
          // اگر Browser API در دسترس نبود، فرض می‌کنیم مرورگر کروم است
          handlePlayGoogleTTS(
            message,
            sender,
            sendResponse,
            playAudioViaOffscreen,
            errorHandler
          );
        } else {
          console.error(
            "[Background:onMessage] Could not determine browser API."
          );
          sendResponse({ error: "Could not determine browser API." });
        }
        return true; // Indicate asynchronous operation
      } catch (error) {
        console.error("[Background:onMessage] Error in playGoogleTTS:", error);
        sendResponse({ error: error.message || "Failed to play TTS." });
      }
      return true; // Handler is async

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
        console.error(
          "[Background:onMessage] Error in activateSelectElementMode:",
          error
        );
        sendResponse({
          error: error.message || "Failed to activate select element mode.",
        });
      }
      return true; // Handler is async

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
