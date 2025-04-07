// src/listeners/onMessage.js
import { ErrorHandler } from "../services/ErrorService.js";
import { logME } from "../utils/helpers.js";
import { translateText } from "../utils/api.js";

// --- Import Handlers ---
import { handleExtensionLifecycle } from "../handlers/extensionLifecycleHandler.js";
import { handleGetSelectedText } from "../handlers/getSelectedTextHandler.js";
import { handleUpdateSelectElementState } from "../handlers/selectElementStatesHandler.js";
import { handlePlayGoogleTTS } from "../handlers/ttsHandler.js";
import { handleFetchTranslation } from "../handlers/translationHandler.js";
import { handleActivateSelectElementMode } from "../handlers/elementModeHandler.js";

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
  // ... (implementation as before) ...
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        if (
          err.message !==
            "The message port closed before a response was received." &&
          err.message !==
            "Could not establish connection. Receiving end does not exist."
        ) {
          logME("[Util:Messaging] safeSendMessage error:", err.message);
          resolve({ error: err.message }); // Report other errors
        } else {
          logME(
            "[Util:Messaging] safeSendMessage: Port closed or no receiver (ignored)."
          );
          // Don't resolve, let caller handle timeout or lack of response
        }
      } else {
        resolve(response);
      }
    });
  });
}

let creatingOffscreen;
async function playAudioViaOffscreen(url) {
  // ... (implementation as before, potentially moved to src/utils/offscreen.js and imported) ...
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });

  if (existingContexts.length === 0) {
    if (creatingOffscreen) {
      await creatingOffscreen;
    } else {
      logME("[Util:Offscreen] Creating offscreen document.");
      creatingOffscreen = chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
        justification: "Play TTS audio from Google Translate",
      });
      try {
        await creatingOffscreen;
      } finally {
        creatingOffscreen = null;
      }
    }
  } else {
    logME("[Util:Offscreen] Offscreen document already exists.");
  }

  logME("[Util:Offscreen] Sending message to offscreen with URL:", url);
  try {
    // Use chrome.runtime.sendMessage without target for offscreen documents
    const response = await chrome.runtime.sendMessage({
      // No target needed when sending from background to offscreen
      action: "playOffscreenAudio",
      url: url,
    });
    // Check the response format received from offscreen.js
    if (!response || !response.success) {
      throw new Error(
        response?.error || "Offscreen document failed to play audio or respond."
      );
    }
    logME(
      "[Util:Offscreen] Audio playback initiated successfully via offscreen."
    );
  } catch (error) {
    logME(
      "[Util:Offscreen] Error sending message to offscreen or playing audio:",
      error
    );
    if (
      error.message.includes("Could not establish connection") ||
      error.message.includes("Receiving end does not exist")
    ) {
      logME(
        "[Util:Offscreen] Attempting to close existing offscreen documents due to connection error."
      );
      // Attempt to close the document, might fail if already gone
      await chrome.offscreen
        .closeDocument()
        .catch((e) =>
          logME(
            "[Util:Offscreen] Error closing document (might be expected):",
            e
          )
        );
      // Rethrow a specific error? Or just the original.
    }
    throw error; // Re-throw the error to be handled by the caller (e.g., TTS handler)
  }
}

// --- Main Message Listener (Dispatcher) ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

    case "getSelectedText":
      // Pass dependencies
      return handleGetSelectedText(
        message,
        sender,
        sendResponse,
        safeSendMessage
      );

    case "sendSelectedTextResponse":
      logME(
        "[Background:onMessage] Acknowledged sendSelectedTextResponse (no action)."
      );
      return false; // Synchronous handling (no-op)

    case "UPDATE_SELECT_ELEMENT_STATE":
      // Pass state object
      return handleUpdateSelectElementState(
        message,
        sender,
        selectElementStates
      );

    case "playGoogleTTS":
      // Pass dependencies
      handlePlayGoogleTTS(
        message,
        sender,
        sendResponse,
        playAudioViaOffscreen,
        errorHandler
      );
      return true; // Handler is async

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

    case "activateSelectElementMode":
      // Pass dependencies, including the injectionState object
      handleActivateSelectElementMode(
        message,
        sender,
        sendResponse,
        safeSendMessage,
        errorHandler,
        injectionState
      );
      return true; // Handler is async

    default:
      logME("[Background:onMessage] Unhandled action:", action);
      return false;
  }
});

// --- Tab State Cleanup ---
chrome.tabs.onRemoved.addListener((tabId) => {
  if (selectElementStates.hasOwnProperty(tabId)) {
    delete selectElementStates[tabId];
    logME(
      `[Background:onMessage] Cleaned up selectElementState for closed tab ${tabId}`
    );
  }
});

// Log that this module has been loaded and the listener attached.
logME("[Background:onMessage] Listener attached (Dispatcher Mode).");
