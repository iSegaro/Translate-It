// src/handlers/getSelectedTextHandler.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

// This handler is responsible for managing the getSelectedText request
// from the popup or action button. It communicates with the active tab's
// content script to retrieve the selected text.

// Note: safeSendMessage is passed as an argument

export function handleGetSelectedText(
  message,
  sender,
  sendResponse,
  safeSendMessage
) {
  logME("[Handler:GetSelectedText] Handling getSelectedText request.");
  Browser.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    // Ensure the message is from the active tab content script itself, or from the popup/action
    const isActiveTab = tabs.length > 0 && tabs[0].id;
    // Allow request from popup (sender.tab might be undefined or different) or the active tab's content script
    const senderIsActiveContentScript =
      sender.tab && sender.tab.id === isActiveTab;
    const senderIsPopup = !sender.tab; // Approximation: messages from popup don't have sender.tab

    if (isActiveTab && (senderIsActiveContentScript || senderIsPopup)) {
      logME(
        `[Handler:GetSelectedText] Forwarding request to active tab ${tabs[0].id}`
      );
      // Forward the request to the content script in the active tab
      safeSendMessage(tabs[0].id, { action: "getSelectedText" })
        .then((response) => {
          logME(
            "[Handler:GetSelectedText] Received response from content script:",
            response
          );
          sendResponse(response || { selectedText: "" }); // Ensure response is always sent
        })
        .catch((error) => {
          logME(
            "[Handler:GetSelectedText] Error forwarding getSelectedText:",
            error
          );
          sendResponse({
            selectedText: "",
            error: "Failed to communicate with content script",
          });
        });
    } else {
      logME(
        "[Handler:GetSelectedText] No active tab found or sender mismatch for getSelectedText.",
        { isActiveTab, senderTab: sender.tab?.id }
      );
      sendResponse({ selectedText: "" }); // No relevant tab
    }
  });
  return true; // Response is sent asynchronously
}
