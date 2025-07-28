// src/background/handlers/common/handleOpenURL.js

import browser from 'webextension-polyfill';
import { logME } from "../../../utils/helpers.js";

export async function handleOpenURL(message, sender, sendResponse) {
  try {
    const anchor = message.data?.anchor;
    const optionsUrl = browser.runtime.getURL(
      `html/options.html${anchor ? `#${anchor}` : ""}`
    );
    browser.tabs.create({ url: optionsUrl });
    sendResponse({ success: true });
    return true; // Indicates async response
  } catch (error) {
    logME("[handleOpenURL] Failed to open URL:", error);
    sendResponse({ success: false, error: error.message });
    return false;
  }
}