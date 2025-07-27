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
  logME("[Handler:ElementMode] handleActivateSelectElementMode START. Incoming message.data: " + message.data);
  
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
      logME(`[Handler:ElementMode] Tabs query result: ${JSON.stringify(tabs)}`);
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
      logME(`[Handler:ElementMode] Current settings: ${JSON.stringify(settings)}`);
      const selectElementState = settings.selectElementState || false;
      let newState;
      if (typeof message.data === "boolean") {
        newState = message.data;
      } else {
        newState = !selectElementState;
        logME(`[Handler:ElementMode] Non-boolean message.data received. Toggling state. message.data: ${message.data}, type: ${typeof message.data}`);
      }

      logME(`[Handler:ElementMode] Attempting to set selectElementState in storage to: ${newState}`);
      await getBrowser().storage.local.set({ selectElementState: newState });
      logME("[Handler:ElementMode] Storage updated. New state set to: " + newState);

      logME("[Handler:ElementMode] Sending initial TOGGLE_SELECT_ELEMENT_MODE command to content script with data: " + newState);
      // 3) Send toggle command
      let response = await safeSendMessage(tabId, {
        action: "TOGGLE_SELECT_ELEMENT_MODE",
        data: newState,
      });
      logME(`[Handler:ElementMode] Response from content script (initial): ${JSON.stringify(response)}`);
      logME(`[Handler:ElementMode] Type of response from content script (initial): ${typeof response}`);

      // If deactivating and content script is not reachable, consider it successful
      if (newState === false && response?.error) {
          logME("[Handler:ElementMode] Deactivation path: Content script not reachable, considering deactivation successful. Response error: " + response.error);
          logME("[Handler:ElementMode] BEFORE sendResponse for deactivation success.");
          console.log("[Handler:ElementMode] Calling sendResponse for deactivation with:", { success: true, newState });
          sendResponse({ success: true, newState });
          console.log("[Handler:ElementMode] Deactivation sendResponse called successfully");
          logME("[Handler:ElementMode] AFTER final sendResponse for deactivation.");
          return; // Exit early
      }

      // If activating and content script is not reachable, try to inject
      if (newState === true && response?.error && !injectionState.inProgress) {
        logME("[Handler:ElementMode] Activation path: Initial message failed, attempting injection. Error: " + response.error);
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
          logME(`[Handler:ElementMode] Response from content script (retry after injection): ${JSON.stringify(response)}`);
          logME(`[Handler:ElementMode] Type of response from content script (retry after injection): ${typeof response}`);
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
      logME("[Handler:ElementMode] Operation successful, BEFORE final sendResponse. Response to send: " + JSON.stringify({ success: true, newState }));
      console.log("[Handler:ElementMode] Calling sendResponse with:", { success: true, newState });
      sendResponse({ success: true, newState });
      console.log("[Handler:ElementMode] sendResponse called successfully");
      logME("[Handler:ElementMode] AFTER final sendResponse.");
    } catch (err) {
      logME("[Handler:ElementMode] Error caught in handleActivateSelectElementMode:", err);
      // Normalize and report
      await errorHandler.handle(err, {
        type: err.type || ErrorTypes.INTEGRATION,
        context: "handler-activateSelectElementMode",
      });
      logME("[Handler:ElementMode] BEFORE sendResponse for caught error. Error message: " + err.message);
      console.log("[Handler:ElementMode] Calling sendResponse with error:", { success: false, error: err.message });
      sendResponse({ success: false, error: err.message });
      console.log("[Handler:ElementMode] Error sendResponse called successfully");
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
