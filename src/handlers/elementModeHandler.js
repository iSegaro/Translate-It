// This handler is responsible for managing the select element mode.
// It toggles the mode on or off based on the message received from the popup.

// src/handlers/elementModeHandler.js
import { getBrowser } from "@/utils/browser-polyfill.js";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorTypes.js";
import { getSettingsAsync } from "../config.js";

/**
 * Toggle “select element” mode in the content script, with automatic injection fallback.
 *
 * Dependencies (passed in):
 *  - safeSendMessage(tabId, message)
 *  - errorHandler (instance of ErrorHandler)
 *  - injectionState: { inProgress: boolean }
 */
export async function handleActivateSelectElementMode(
  message,
  sender,
  sendResponse,
  safeSendMessage,
  errorHandler,
  injectionState
) {
  logME("[Handler:ElementMode] Toggling select-element-mode…");
  let tabId;
  try {
    // 1) Find active tab
    const tabs = await getBrowser().tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tabs[0]?.id) {
      const err = new Error(ErrorTypes.TAB_AVAILABILITY);
      err.type = ErrorTypes.TAB_AVAILABILITY;
      throw err;
    }
    tabId = tabs[0].id;

    // 2) Determine new state
    const settings = await getSettingsAsync();
    const selectElementState = settings.selectElementState || false;
    const newState =
      typeof message.data === "boolean" ? message.data : !selectElementState;

    logME(`[Handler:ElementMode] Setting selectElementState → ${newState}`);
    await getBrowser().storage.local.set({ selectElementState: newState });

    // 3) Send toggle command
    let response = await safeSendMessage(tabId, {
      action: "TOGGLE_SELECT_ELEMENT_MODE",
      data: newState,
    });

    // 4) If that fails and we’re not already injecting, inject and retry
    if (response?.error && !injectionState.inProgress) {
      injectionState.inProgress = true;
      try {
        await getBrowser().scripting.executeScript({
          target: { tabId },
          files: ["browser-polyfill.js", "content.bundle.js"],
        });
        response = await safeSendMessage(tabId, {
          action: "TOGGLE_SELECT_ELEMENT_MODE",
          data: newState,
        });
        if (response?.error) {
          const err = new Error(response.error);
          err.type = ErrorTypes.INTEGRATION;
          throw err;
        }
      } catch (injectionErr) {
        await errorHandler.handle(injectionErr, {
          type: ErrorTypes.INTEGRATION,
          context: "handler-elementMode-injection",
        });
        sendResponse({
          success: false,
          error: "Could not inject content script.",
        });
        return;
      } finally {
        injectionState.inProgress = false;
      }
    }

    // 5) Done
    sendResponse({ success: true, newState });
  } catch (err) {
    // Normalize and report
    await errorHandler.handle(err, {
      type: err.type || ErrorTypes.INTEGRATION,
      context: "handler-activateSelectElementMode",
    });
    sendResponse({ success: false, error: err.message });
    if (injectionState.inProgress) injectionState.inProgress = false;
  }
}
