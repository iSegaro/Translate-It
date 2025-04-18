import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { ErrorTypes } from "../services/ErrorService.js";

// Dependencies passed: safeSendMessage, errorHandler
// State needed: injectionInProgress (passed as an object to allow modification)

export async function handleActivateSelectElementMode(
  message,
  sender,
  sendResponse,
  safeSendMessage,
  errorHandler,
  injectionState
) {
  logME("[Handler:ElementMode] Handling activateSelectElementMode request");

  const tabs = await Browser.tabs.query({ active: true, currentWindow: true });

  if (tabs.length === 0 || !tabs[0]?.id) {
    logME("[Handler:ElementMode] No active tab found.");
    sendResponse({ error: "No active tab found" });
    return; // Exit early
  }
  const tabId = tabs[0].id;

  try {
    // Determine the new state
    const result = await Browser.storage.local.get(["selectElementState"]);
    const currentState = result.selectElementState || false;
    const newState =
      typeof message.data === "boolean" ? message.data : !currentState;

    logME(
      `[Handler:ElementMode] Toggling select element mode for tab ${tabId} to: ${newState}`
    );

    await Browser.storage.local.set({ selectElementState: newState });

    // Send message to content script, attempt injection if it fails
    let response = await safeSendMessage(tabId, {
      action: "TOGGLE_SELECT_ELEMENT_MODE",
      data: newState,
    });

    // If sending failed and no injection is currently in progress
    if (response?.error && !injectionState.inProgress) {
      logME(
        "[Handler:ElementMode] Initial message failed, attempting script injection:",
        response.error
      );
      injectionState.inProgress = true; // Set flag via passed object reference
      try {
        await Browser.scripting.executeScript({
          target: { tabId },
          files: ["browser-polyfill.js", "content.bundle.js"],
        });
        logME(
          "[Handler:ElementMode] Script injected successfully, resending toggle command."
        );
        response = await safeSendMessage(tabId, {
          action: "TOGGLE_SELECT_ELEMENT_MODE",
          data: newState,
        });

        if (response?.error) {
          throw new Error(
            `Failed to communicate with content script after injection: ${response.error}`
          );
        }
      } catch (scriptError) {
        logME(
          "[Handler:ElementMode] Script injection or re-sending failed:",
          scriptError
        );
        errorHandler.handle(scriptError, {
          type: ErrorTypes.INTEGRATION,
          context: "handler-elementMode-injection",
          statusCode: 500,
        });
        sendResponse({
          error: "Failed to activate mode: content script issue.",
        });
        // Reset flag on failure before returning
        injectionState.inProgress = false;
        return; // Exit early on failure
      } finally {
        // Reset flag once this attempt (injection + resend) is done
        injectionState.inProgress = false;
      }
    } else if (response?.error && injectionState.inProgress) {
      logME(
        "[Handler:ElementMode] Injection already in progress, skipping duplicate attempt."
      );
    }

    logME(
      "[Handler:ElementMode] Select element mode toggle command sent successfully."
    );
    sendResponse({ status: "done", newState: newState });
  } catch (error) {
    logME("[Handler:ElementMode] Error activating select element mode:", error);
    errorHandler.handle(error, {
      type: ErrorTypes.INTEGRATION,
      context: "handler-activateSelectElementMode",
    });
    sendResponse({
      error: error.message || "Failed to toggle select element mode.",
    });
    // Ensure flag is reset if an error occurs outside the injection block
    injectionState.inProgress = false;
  }
  // No explicit return needed here as sendResponse is called in all paths,
  // but we need 'return true' in the main listener to keep the channel open.
}
