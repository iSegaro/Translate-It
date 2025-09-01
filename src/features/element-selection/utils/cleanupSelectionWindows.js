// src/features/element-selection/utils/cleanupSelectionWindows.js

import { browser } from "@/utils/browser-polyfill.js";

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'cleanupSelectionWindows');


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
          logger.error('remove failed:', e);
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
  } catch (err) {
    logger.debug(`dismissAll in tab ${tabId} failed:`, err);
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
  logger.error('dismissAllSelectionWindows failed:', err);
  }
}
