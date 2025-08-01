// src/background/handlers/common/handleOpenURL.js

import browser from 'webextension-polyfill';
import { logME } from "../../../utils/helpers.js";

export async function handleOpenURL(message) {
  try {
    const anchor = message.data?.anchor;
    const optionsUrl = browser.runtime.getURL(
      `html/options.html${anchor ? `#${anchor}` : ""}`
    );
    browser.tabs.create({ url: optionsUrl });
    return { success: true };
  } catch (error) {
    logME("[handleOpenURL] Failed to open URL:", error);
    return { success: false, error: error.message };
  }
}