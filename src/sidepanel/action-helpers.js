// src/sidepanel/action-helpers.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

/**
 * Opens the extension's side panel in a cross-browser compatible way.
 * It automatically finds the active tab if a tabId is not provided.
 * @param {number} [tabId] - The optional ID of the tab to open the panel against.
 */
export async function openSidePanel(tabId) {
  try {
    // Chrome uses the `sidePanel` API
    if (Browser.sidePanel) {
      let targetTabId = tabId;

      // If no tabId was provided, find the active tab in the current window.
      if (!targetTabId) {
        const [activeTab] = await Browser.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (activeTab) {
          targetTabId = activeTab.id;
        }
      }

      // Now, ensure we have a valid tab ID before proceeding.
      if (targetTabId) {
        await Browser.sidePanel.open({ tabId: targetTabId });
        logME(`[ActionHelper] Opened side panel for tab ${targetTabId}.`);
      } else {
        throw new Error("Could not determine the target tab for the side panel.");
      }
    } 
    // Firefox uses the `sidebarAction` API
    else if (Browser.sidebarAction) {
      await Browser.sidebarAction.open();
      logME("[ActionHelper] Opened sidebar.");
    } 
    // Fallback if no known API is found
    else {
      logME("[ActionHelper] No supported side panel/sidebar API found.");
    }
  } catch (error) {
    logME("[ActionHelper] Error opening side panel/sidebar:", error);
  }
}