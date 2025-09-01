// This handler is responsible for managing the getSelectedText request
// from the popup or action button. It communicates with the active tab's
// content script to retrieve the selected text.

// Note: safeSendMessage is passed as an argument

// src/handlers/getSelectedTextHandler.js
import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'getSelectedText');

import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";

// removed legacy createLogger import


export async function handleGetSelectedText(
  message,
  sender,
  sendResponse,
  safeSendMessage,
) {
  logger.debug('Handling request.');
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    const tab = tabs[0];
    const fromPopup = !sender.tab;
    if (!tab) throw new Error(ErrorTypes.TAB_AVAILABILITY);
    if (fromPopup || (sender.tab && sender.tab.id === tab.id)) {
      const response = await safeSendMessage(tab.id, {
        action: "getSelectedText",
      });
  logger.debug('Got:', response);
      sendResponse(response || { selectedText: "" });
    } else {
      sendResponse({ selectedText: "" });
    }
  } catch (err) {
  logger.error('Error:', err);
    sendResponse({ selectedText: "", error: String(err) });
  }
  return true;
}
