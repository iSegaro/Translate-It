/**
 * Context Menu Handler - Unified handler for contextMenus.onClicked events
 * Handles right-click context menu actions
 */

import browser from "webextension-polyfill";
import { sendSmart } from '@/shared/messaging/core/SmartMessaging.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'context-menu-handler');

import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

// removed legacy createLogger import


import { handleActivateSelectElementMode } from "../background/handlers/element-selection/handleActivateSelectElementMode.js";

/**
 * Handle translate element context menu
 */
async function handleTranslateElement(info, tab) {
  try {
    logger.debug('Translate element menu clicked, activating select mode via central handler');

    // Construct message and sender objects to pass to the central handler
    const message = {
      action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
      context: 'context-menu',
      data: { active: true, tabId: tab.id }
    };
    const sender = { tab };

    // Call the central handler to ensure state is managed correctly
    await handleActivateSelectElementMode(message, sender);

    logger.debug('Select element mode activation requested via central handler');
  } catch (error) {
    logger.error('Error handling translate element:', error);
  }
}

/**
 * Handle translate selected text context menu
 */
async function handleTranslateText(info, tab) {
  try {
  logger.debug('Translate text menu clicked');

    const selectedText = info.selectionText;
    if (!selectedText) {
  logger.debug('No text selected');
      return;
    }

    // Send message to content script to translate selected text
    await browser.tabs.sendMessage(tab.id, {
      action: MessageActions.CONTEXT_MENU_TRANSLATE_TEXT,
      text: selectedText,
      info,
      timestamp: Date.now(),
    });

  logger.debug('Translate text message sent to content script');
  } catch (error) {
  logger.error('Error handling translate text:', error);
  }
}

/**
 * Handle API provider selection context menu
 */
async function handleProviderSelection(info, tab, providerId) {
  try {
  logger.debug('Provider selection:', providerId);

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
  logger.error('Failed to show provider change notification:', notifError);
    }

  logger.debug('Provider changed to', providerId);
  } catch (error) {
  logger.error('Error handling provider selection:', error);
  }
}

/**
 * Handle open sidepanel context menu
 */
async function handleOpenSidepanel(info, tab) {
  try {
  logger.debug('Open sidepanel menu clicked');

    // Try to open sidepanel
    try {
      if (browser.sidePanel && browser.sidePanel.open) {
        await browser.sidePanel.open({ windowId: tab.windowId });
  logger.debug('Sidepanel opened');
      } else {
        // Fallback - send message to background to handle
        await sendSmart({
          action: MessageActions.OPEN_SIDE_PANEL,
          source: "context_menu",
          tabId: tab.id,
          timestamp: Date.now(),
        }).catch(err => logger.error('Failed to request open sidepanel (reliable):', err));
  logger.debug('Sidepanel open request sent to background');
      }
    } catch (sidepanelError) {
  logger.error('Error opening sidepanel:', sidepanelError);
    }
  } catch (error) {
  logger.error('Error handling open sidepanel:', error);
  }
}

/**
 * Handle screenshot/capture context menu
 */
async function handleScreenCapture(info, tab) {
  try {
  logger.debug('Screen capture menu clicked');

    // Send message to background to start screen capture
    await sendSmart({
      action: MessageActions.START_CAPTURE_SELECTION,
      source: "context_menu",
      tabId: tab.id,
      timestamp: Date.now(),
    }).catch(err => logger.error('Failed to request screen capture (reliable):', err));

  logger.debug('Screen capture request sent to background');
  } catch (error) {
  logger.error('Error handling screen capture:', error);
  }
}

/**
 * Handle open options context menu
 */
async function handleOpenOptions() {
  try {
    logger.debug('Open options menu clicked');

    const optionsUrl = browser.runtime.getURL("options.html");
    await browser.tabs.create({ url: optionsUrl });

    logger.debug('Options page opened');
  } catch (error) {
    logger.error('Error handling open options:', error);
  }
}

/**
 * Handle exclude/include current page context menu
 */
async function handlePageExclusion(info, tab, exclude = true) {
  try {
    logger.debug(`${exclude ? "Exclude" : "Include"} page menu clicked`);

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

    logger.info(`Page ${exclude ? "excluded" : "included"}: ${domain}`);
  } catch (error) {
    logger.error('Error handling page exclusion:', error);
  }
}

/**
 * Main context menu event handler
 */
export async function handleContextMenuEvent(info, tab) {
  logger.info('Context menu clicked: ${info.menuItemId}', {
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
      await handleOpenOptions();
    } else if (menuItemId === "exclude-page") {
      await handlePageExclusion(info, tab, true);
    } else if (menuItemId === "include-page") {
      await handlePageExclusion(info, tab, false);
    } else if (menuItemId.startsWith("provider-")) {
      // Handle API provider selection
      const providerId = menuItemId.replace("provider-", "");
      await handleProviderSelection(info, tab, providerId);
    } else {
      logger.debug('Unknown menu item: ${menuItemId}');
    }

    logger.init('Menu item ${menuItemId} handled successfully');
  } catch (error) {
    logger.error('Error handling context menu ${info.menuItemId}:', error,
    );
    throw error;
  }
}
