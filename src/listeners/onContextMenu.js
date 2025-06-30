// src/listeners/onContextMenu.js

import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js"; // ADDED: Import for i18n

// --- Constants for Menu Item IDs ---
const PAGE_CONTEXT_MENU_ID = "translate-with-select-element";
const ACTION_CONTEXT_MENU_OPTIONS_ID = "open-options-page";
const ACTION_CONTEXT_MENU_SHORTCUTS_ID = "open-shortcuts-page";
const HELP_MENU_ID = "open-help-page";
const COMMAND_NAME = "toggle-select-element";

/**
 * Creates or updates all context menus for the extension.
 * This function is now centralized and can be called from onInstalled or on-demand.
 */
export async function setupContextMenus() {
  // Clear all previous context menus to prevent duplicate errors
  await Browser.contextMenus.removeAll();
  logME("[ContextMenuSetup] All previous context menus removed.");

  // --- 1. Create Page Context Menu ---
  try {
    let pageMenuTitle = await getTranslationString("context_menu_translate_with_selection") || "Translate Element";
    const commands = await Browser.commands.getAll();
    const command = commands.find((c) => c.name === COMMAND_NAME);
    if (command && command.shortcut) {
      pageMenuTitle = `${pageMenuTitle} (${command.shortcut})`;
    }
    Browser.contextMenus.create({
      id: PAGE_CONTEXT_MENU_ID,
      title: pageMenuTitle,
      contexts: ["page", "selection", "link", "image", "video", "audio"],
    });
    logME(`[ContextMenuSetup] Page context menu created with title: "${pageMenuTitle}"`);
  } catch (e) {
    logME("Error creating page context menu:", e);
  }

  // --- 2. Create Action (Browser Action) Context Menus ---
  try {
    Browser.contextMenus.create({
      id: ACTION_CONTEXT_MENU_OPTIONS_ID,
      title: (await getTranslationString("context_menu_options")) || "Options",
      contexts: ["action"],
    });

    Browser.contextMenus.create({
      id: ACTION_CONTEXT_MENU_SHORTCUTS_ID,
      title: (await getTranslationString("context_menu_shortcuts")) || "Manage Shortcuts",
      contexts: ["action"],
    });

    Browser.contextMenus.create({
      id: HELP_MENU_ID,
      title: (await getTranslationString("context_menu_help")) || "Help & Support",
      contexts: ["action"],
    });
    logME("[ContextMenuSetup] Action context menus created successfully.");
  } catch (e) {
    logME("Error creating action context menus:", e);
  }
}

/**
 * Listener for when a context menu item is clicked.
 */
Browser.contextMenus.onClicked.addListener(async (info, tab) => {
  logME(`[ContextMenu] Clicked menu item: ${info.menuItemId}`);

  switch (info.menuItemId) {
    case PAGE_CONTEXT_MENU_ID:
      if (tab && tab.id) {
        Browser.tabs.sendMessage(tab.id, {
          action: "TOGGLE_SELECT_ELEMENT_MODE",
          data: true,
        }).catch((err) => {
          logME(`[ContextMenu] Could not send message to tab ${tab.id}:`, err.message);
        });
      }
      break;
    case ACTION_CONTEXT_MENU_OPTIONS_ID:
      Browser.runtime.openOptionsPage();
      break;
    case ACTION_CONTEXT_MENU_SHORTCUTS_ID:
      try {
        const browserInfo = await Browser.runtime.getBrowserInfo();
        const url = browserInfo.name === "Firefox" ? "html/options.html#help=shortcut" : "chrome://extensions/shortcuts";
        Browser.tabs.create({ url });
      } catch (e) {
        logME("Could not determine browser type, opening for Chrome as default.", e);
        Browser.tabs.create({ url: "chrome://extensions/shortcuts" });
      }
      break;
    case HELP_MENU_ID:
      Browser.tabs.create({ url: "html/options.html#help" });
      break;
  }
});

logME("[ContextMenu] Click listener is active.");