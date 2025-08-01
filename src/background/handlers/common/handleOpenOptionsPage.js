// src/background/handlers/common/handleOpenOptionsPage.js

import browser from 'webextension-polyfill';
import { logME } from "../../../utils/helpers.js";

export async function handleOpenOptionsPage() {
  try {
    browser.runtime.openOptionsPage();
    return { success: true };
  } catch (error) {
    logME("[handleOpenOptionsPage] Failed to open options page:", error);
    return { success: false, error: error.message };
  }
}