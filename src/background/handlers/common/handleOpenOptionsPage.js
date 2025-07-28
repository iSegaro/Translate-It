// src/background/handlers/common/handleOpenOptionsPage.js

import browser from 'webextension-polyfill';
import { logME } from "../../../utils/helpers.js";

export async function handleOpenOptionsPage(message, sender, sendResponse) {
  try {
    browser.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false; // No async response needed
  } catch (error) {
    logME("[handleOpenOptionsPage] Failed to open options page:", error);
    sendResponse({ success: false, error: error.message });
    return false;
  }
}