// src/utils/cleanupSelectionWindows.js

import { browser } from "@/utils/browser-polyfill.js";
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

    if (browser.scripting && browser.scripting.executeScript) {
      await browser.scripting.executeScript({
        target: { tabId },
        func: cleanupFn,
      });
    } else {
      // Fallback for MV2 or older browsers
      await browser.tabs.executeScript(tabId, {
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
    const tabs = await browser.tabs.query({ url: "<all_urls>" });
    for (const tab of tabs) {
      if (!tab.id) continue;
      await dismissAllSelectionWindowsInTab(tab.id);
    }
  } catch (err) {
    logME("[SelectionWindows] dismissAllSelectionWindows failed:", err);
  }
}
