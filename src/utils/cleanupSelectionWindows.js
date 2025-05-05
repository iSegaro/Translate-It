// src/utils/cleanupSelectionWindows.js

import Browser from "webextension-polyfill";
import { logME } from "./helpers";

/**
 * Injects and runs a DOM cleanup script in the given tab to remove
 * all selection window popups created by this extension.
 * @param {number} tabId
 */
export async function dismissAllSelectionWindowsInTab(tabId) {
  try {
    const cleanupFn = () => {
      document.querySelectorAll(".aiwc-selection-popup-host").forEach((el) => {
        try {
          el.remove();
        } catch (e) {
          logME("[SelectionWindows] remove failed:", e);
        }
      });
    };

    if (Browser.scripting && Browser.scripting.executeScript) {
      await Browser.scripting.executeScript({
        target: { tabId },
        func: cleanupFn,
      });
    } else {
      // Fallback for MV2 or older browsers
      await Browser.tabs.executeScript(tabId, {
        func: cleanupFn,
      });
    }
  } catch {
    // logME(`[SelectionWindows] dismissAll in tab ${tabId} failed:`, err);
  }
}

/**
 * Queries all tabs and dismisses selection windows in each.
 */
export async function dismissAllSelectionWindows() {
  try {
    const tabs = await Browser.tabs.query({ url: "<all_urls>" });
    for (const tab of tabs) {
      if (!tab.id) continue;
      await dismissAllSelectionWindowsInTab(tab.id);
    }
  } catch (err) {
    logME("[SelectionWindows] dismissAllSelectionWindows failed:", err);
  }
}
