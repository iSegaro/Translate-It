// src/background/handlers/common/handleOpenURL.js

import { getBrowserAPI } from "../../../utils/browser-unified.js";
import { logME } from "../../../utils/helpers.js";

export async function handleOpenURL(message, sender, sendResponse) {
  try {
    const Browser = await getBrowserAPI();
    const anchor = message.data?.anchor;
    const optionsUrl = Browser.runtime.getURL(
      `html/options.html${anchor ? `#${anchor}` : ""}`
    );
    Browser.tabs.create({ url: optionsUrl });
    sendResponse({ success: true });
    return true; // Indicates async response
  } catch (error) {
    logME("[handleOpenURL] Failed to open URL:", error);
    sendResponse({ success: false, error: error.message });
    return false;
  }
}