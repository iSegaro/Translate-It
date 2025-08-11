/**
 * Context Menu Handler - Unified handler for contextMenus.onClicked events
 * Handles right-click context menu actions
 */

import browser from "webextension-polyfill";
import { logME } from "../utils/core/helpers.js";
import { storageManager } from "@/storage/core/StorageCore.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";

/**
 * Handle translate element context menu
 */
async function handleTranslateElement(info, tab) {
  try {
    logME("[ContextMenuHandler] Translate element menu clicked");

    // Send message to content script to translate selected element
    await browser.tabs.sendMessage(tab.id, {
      action: MessageActions.CONTEXT_MENU_TRANSLATE_ELEMENT,
      info,
      timestamp: Date.now(),
    });

    logME(
      "[ContextMenuHandler] Translate element message sent to content script",
    );
  } catch (error) {
    logME("[ContextMenuHandler] Error handling translate element:", error);
  }
}

/**
 * Handle translate selected text context menu
 */
async function handleTranslateText(info, tab) {
  try {
    logME("[ContextMenuHandler] Translate text menu clicked");

    const selectedText = info.selectionText;
    if (!selectedText) {
      logME("[ContextMenuHandler] No text selected");
      return;
    }

    // Send message to content script to translate selected text
    await browser.tabs.sendMessage(tab.id, {
      action: MessageActions.CONTEXT_MENU_TRANSLATE_TEXT,
      text: selectedText,
      info,
      timestamp: Date.now(),
    });

    logME("[ContextMenuHandler] Translate text message sent to content script");
  } catch (error) {
    logME("[ContextMenuHandler] Error handling translate text:", error);
  }
}

/**
 * Handle API provider selection context menu
 */
async function handleProviderSelection(info, tab, providerId) {
  try {
    logME(`[ContextMenuHandler] Provider selection: ${providerId}`);

    // Update the translation API setting
    await storageManager.set({ TRANSLATION_API: providerId });

    // Refresh context menus to show updated selection
    // Note: Context menu refreshing is now handled by ContextMenuManager
    const { featureLoader } = await import("../background/feature-loader.js");
    const contextMenuManager = await featureLoader.loadContextMenuManager();
    await contextMenuManager.refreshMenus();

    // Show notification about provider change
    try {
      await browser.notifications.create("provider-changed", {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/extension_icon_128.png"),
        title: "Provider Changed",
        message: `Translation provider changed to ${providerId}`,
      });
    } catch (notifError) {
      logME(
        "[ContextMenuHandler] Failed to show provider change notification:",
        notifError,
      );
    }

    logME(`[ContextMenuHandler] Provider changed to ${providerId}`);
  } catch (error) {
    logME("[ContextMenuHandler] Error handling provider selection:", error);
  }
}

/**
 * Handle open sidepanel context menu
 */
async function handleOpenSidepanel(info, tab) {
  try {
    logME("[ContextMenuHandler] Open sidepanel menu clicked");

    // Try to open sidepanel
    try {
      if (browser.sidePanel && browser.sidePanel.open) {
        await browser.sidePanel.open({ windowId: tab.windowId });
        logME("[ContextMenuHandler] Sidepanel opened");
      } else {
        // Fallback - send message to background to handle
        await browser.runtime.sendMessage({
          action: MessageActions.OPEN_SIDE_PANEL,
          source: "context_menu",
          tabId: tab.id,
          timestamp: Date.now(),
        });
        logME("[ContextMenuHandler] Sidepanel open request sent to background");
      }
    } catch (sidepanelError) {
      logME("[ContextMenuHandler] Error opening sidepanel:", sidepanelError);
    }
  } catch (error) {
    logME("[ContextMenuHandler] Error handling open sidepanel:", error);
  }
}

/**
 * Handle screenshot/capture context menu
 */
async function handleScreenCapture(info, tab) {
  try {
    logME("[ContextMenuHandler] Screen capture menu clicked");

    // Send message to background to start screen capture
    await browser.runtime.sendMessage({
      action: MessageActions.START_CAPTURE_SELECTION,
      source: "context_menu",
      tabId: tab.id,
      timestamp: Date.now(),
    });

    logME("[ContextMenuHandler] Screen capture request sent to background");
  } catch (error) {
    logME("[ContextMenuHandler] Error handling screen capture:", error);
  }
}

/**
 * Handle open options context menu
 */
async function handleOpenOptions(info, tab) {
  try {
    logME("[ContextMenuHandler] Open options menu clicked");

    const optionsUrl = browser.runtime.getURL("options.html");
    await browser.tabs.create({ url: optionsUrl });

    logME("[ContextMenuHandler] Options page opened");
  } catch (error) {
    logME("[ContextMenuHandler] Error handling open options:", error);
  }
}

/**
 * Handle exclude/include current page context menu
 */
async function handlePageExclusion(info, tab, exclude = true) {
  try {
    logME(
      `[ContextMenuHandler] ${exclude ? "Exclude" : "Include"} page menu clicked`,
    );

    const currentUrl = tab.url;
    const domain = new URL(currentUrl).hostname;

    // Get current excluded sites
    const storage = await storageManager.get(["EXCLUDED_SITES"]);
    const excludedSites = (storage.EXCLUDED_SITES || "")
      .split(",")
      .filter((site) => site.trim());

    if (exclude) {
      // Add domain to excluded sites
      if (!excludedSites.includes(domain)) {
        excludedSites.push(domain);
        await storageManager.set({
          EXCLUDED_SITES: excludedSites.join(","),
        });

        // Show notification
        await browser.notifications.create("site-excluded", {
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/extension_icon_128.png"),
          title: "Site Excluded",
          message: `${domain} has been excluded from translation`,
        });
      }
    } else {
      // Remove domain from excluded sites
      const updatedSites = excludedSites.filter((site) => site !== domain);
      await storageManager.set({
        EXCLUDED_SITES: updatedSites.join(","),
      });

      // Show notification
      await browser.notifications.create("site-included", {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/extension_icon_128.png"),
        title: "Site Included",
        message: `${domain} has been included for translation`,
      });
    }

    logME(
      `[ContextMenuHandler] Page ${exclude ? "excluded" : "included"}: ${domain}`,
    );
  } catch (error) {
    logME("[ContextMenuHandler] Error handling page exclusion:", error);
  }
}

/**
 * Main context menu event handler
 */
export async function handleContextMenuEvent(info, tab) {
  logME(`[ContextMenuHandler] Context menu clicked: ${info.menuItemId}`, {
    tabId: tab.id,
    url: tab.url,
  });

  try {
    const menuItemId = info.menuItemId;

    // Handle different menu items
    if (menuItemId === "translate-element") {
      await handleTranslateElement(info, tab);
    } else if (menuItemId === "translate-text") {
      await handleTranslateText(info, tab);
    } else if (menuItemId === "open-sidepanel") {
      await handleOpenSidepanel(info, tab);
    } else if (menuItemId === "screen-capture") {
      await handleScreenCapture(info, tab);
    } else if (menuItemId === "open-options") {
      await handleOpenOptions(info, tab);
    } else if (menuItemId === "exclude-page") {
      await handlePageExclusion(info, tab, true);
    } else if (menuItemId === "include-page") {
      await handlePageExclusion(info, tab, false);
    } else if (menuItemId.startsWith("provider-")) {
      // Handle API provider selection
      const providerId = menuItemId.replace("provider-", "");
      await handleProviderSelection(info, tab, providerId);
    } else {
      logME(`[ContextMenuHandler] Unknown menu item: ${menuItemId}`);
    }

    logME(`[ContextMenuHandler] Menu item ${menuItemId} handled successfully`);
  } catch (error) {
    logME(
      `[ContextMenuHandler] Error handling context menu ${info.menuItemId}:`,
      error,
    );
    throw error;
  }
}
