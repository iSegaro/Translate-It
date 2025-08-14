// This handler is responsible for managing the getSelectedText request
// from the popup or action button. It communicates with the active tab's
// content script to retrieve the selected text.

// Note: safeSendMessage is passed as an argument

// src/handlers/getSelectedTextHandler.js
import browser from "webextension-polyfill";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'getSelectedText');
  }
  return _logger;
};

import { ErrorTypes } from "../error-management/ErrorTypes.js";

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


export async function handleGetSelectedText(
  message,
  sender,
  sendResponse,
  safeSendMessage,
) {
  getLogger().debug('Handling request.');
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
      getLogger().debug('Got:', response);
      sendResponse(response || { selectedText: "" });
    } else {
      sendResponse({ selectedText: "" });
    }
  } catch (err) {
    getLogger().error('Error:', err);
    sendResponse({ selectedText: "", error: String(err) });
  }
  return true;
}
