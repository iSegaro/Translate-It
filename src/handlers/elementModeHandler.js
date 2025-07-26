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
export function handleActivateSelectElementMode(
  message,
  sender,
  sendResponse,
  safeSendMessage,
  errorHandler,
  injectionState
) {
  console.log("[Handler:ElementMode] >>> ENTERING handleActivateSelectElementMode");
  logME("[Handler:ElementMode] handleActivateSelectElementMode START.");
  
  // Return true to indicate that sendResponse will be called asynchronously
  // This is crucial for Chrome extensions to keep the message channel open
  (async () => {
    let tabId;
    try {
      logME("[Handler:ElementMode] Querying active tab.");
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
      logME(`[Handler:ElementMode] Active tab ID: ${tabId}`);

      logME("[Handler:ElementMode] Getting settings.");
      // 2) Determine new state
      const settings = await getSettingsAsync();
      const selectElementState = settings.selectElementState || false;
      const newState =
        typeof message.data === "boolean" ? message.data : !selectElementState;

      logME(`[Handler:ElementMode] Setting selectElementState → ${newState}`);
      await getBrowser().storage.local.set({ selectElementState: newState });
      logME("[Handler:ElementMode] Storage updated.");

      logME("[Handler:ElementMode] Sending initial toggle command.");
      // 3) Send toggle command
      let response = await safeSendMessage(tabId, {
        action: "TOGGLE_SELECT_ELEMENT_MODE",
        data: newState,
      });
      logME(`[Handler:ElementMode] Response from content script (initial):`, response);
      logME(`[Handler:ElementMode] Type of response from content script (initial):`, typeof response);

      // 4) If that fails and we’re not already injecting, inject and retry
      if (response?.error && !injectionState.inProgress) {
        logME("[Handler:ElementMode] Initial message failed, attempting injection.");
        injectionState.inProgress = true;
        try {
          logME("[Handler:ElementMode] Executing script injection.");
          await getBrowser().scripting.executeScript({
            target: { tabId },
            files: ["browser-polyfill.js", "content.bundle.js"],
          });
          logME("[Handler:ElementMode] Content script injected, retrying message.");
          response = await safeSendMessage(tabId, {
            action: "TOGGLE_SELECT_ELEMENT_MODE",
            data: newState,
          });
          logME(`[Handler:ElementMode] Response from content script (retry):`, response);
          logME(`[Handler:ElementMode] Type of response from content script (retry):`, typeof response);
          if (response?.error) {
            const err = new Error(response.error);
            err.type = ErrorTypes.INTEGRATION;
            throw err;
          }
        } catch (injectionErr) {
          logME("[Handler:ElementMode] Content script injection failed:", injectionErr);
          await errorHandler.handle(injectionErr, {
            type: ErrorTypes.INTEGRATION,
            context: "handler-elementMode-injection",
          });
          logME("[Handler:ElementMode] BEFORE sendResponse for injection error.");
          sendResponse({
            success: false,
            error: "Could not inject content script.",
          });
          logME("[Handler:ElementMode] AFTER sendResponse for injection error.");
          return;
        } finally {
          injectionState.inProgress = false;
        }
      }

      // 5) Done
      logME("[Handler:ElementMode] Operation successful, BEFORE final sendResponse. Response to send: ", { success: true, newState });
      sendResponse({ success: true, newState });
      logME("[Handler:ElementMode] AFTER final sendResponse.");
    } catch (err) {
      logME("[Handler:ElementMode] Error caught:", err);
      // Normalize and report
      await errorHandler.handle(err, {
        type: err.type || ErrorTypes.INTEGRATION,
        context: "handler-activateSelectElementMode",
      });
      logME("[Handler:ElementMode] BEFORE sendResponse for caught error.");
      sendResponse({ success: false, error: err.message });
      logME("[Handler:ElementMode] AFTER sendResponse for caught error.");
      if (injectionState.inProgress) {
        injectionState.inProgress = false;
      }
    } finally {
      logME("[Handler:ElementMode] handleActivateSelectElementMode FINALLY block executed.");
    }
    logME("[Handler:ElementMode] handleActivateSelectElementMode END.");
  })();
  return true; // Indicate that sendResponse will be called asynchronously
}
