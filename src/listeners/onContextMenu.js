// src/listeners/onContextMenu.js

import { getBrowserAsync } from "@/utils/browser-polyfill.js";
import { logME, focusOrCreateTab } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { getTranslationApiAsync } from "../config.js";
import { getSupportedProviders } from "../core/provider-registry.js";

// --- Constants for Menu Item IDs ---
const PAGE_CONTEXT_MENU_ID = "translate-with-select-element";
const ACTION_CONTEXT_MENU_OPTIONS_ID = "open-options-page";
const ACTION_CONTEXT_MENU_SHORTCUTS_ID = "open-shortcuts-page";
const HELP_MENU_ID = "open-help-page";
const API_PROVIDER_PARENT_ID = "api-provider-parent";
const API_PROVIDER_ITEM_ID_PREFIX = "api-provider-";
const COMMAND_NAME = "toggle-select-element";

// --- Get API Providers from Registry ---
function getApiProviders() {
  const availableProviders = getSupportedProviders();
  return availableProviders.map(provider => ({
    id: provider.id,
    i18nKey: `api_provider_${provider.id}`,
    defaultTitle: provider.name
  }));
}

export async function setupContextMenus(Browser) {
  // Clear all previous context menus to prevent duplicate errors
  await Browser.contextMenus.removeAll();
  logME("[ContextMenuSetup] All previous context menus removed.");

  // Get the currently active API to set the 'checked' state
  const currentApi = await getTranslationApiAsync();

  // --- 1. Create Page Context Menu ---
  try {
    let pageMenuTitle =
      (await getTranslationString("context_menu_translate_with_selection")) ||
      "Translate Element";
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
    logME(
      `[ContextMenuSetup] Page context menu created with title: "${pageMenuTitle}"`
    );
  } catch (e) {
    logME("Error creating page context menu:", e);
  }

  // --- 2. Create Action (Browser Action) Context Menus ---
  try {
    // --- Options Menu ---
    Browser.contextMenus.create({
      id: ACTION_CONTEXT_MENU_OPTIONS_ID,
      title: (await getTranslationString("context_menu_options")) || "Options",
      contexts: ["action"],
    });

    // --- API Provider Parent Menu ---
    Browser.contextMenus.create({
      id: API_PROVIDER_PARENT_ID,
      title:
        (await getTranslationString("context_menu_api_provider")) ||
        "API Provider",
      contexts: ["action"],
    });

    // --- API Provider Sub-Menus (Radio Buttons) ---
    const apiProviders = getApiProviders();
    for (const provider of apiProviders) {
      Browser.contextMenus.create({
        id: `${API_PROVIDER_ITEM_ID_PREFIX}${provider.id}`,
        parentId: API_PROVIDER_PARENT_ID,
        title:
          (await getTranslationString(provider.i18nKey)) ||
          provider.defaultTitle,
        type: "radio",
        checked: provider.id === currentApi,
        contexts: ["action"],
      });
    }
    logME(
      `[ContextMenuSetup] API Provider sub-menus created. Current API: ${currentApi}`
    );

    // --- Other Action Menus ---
    Browser.contextMenus.create({
      id: ACTION_CONTEXT_MENU_SHORTCUTS_ID,
      title:
        (await getTranslationString("context_menu_shortcuts")) ||
        "Manage Shortcuts",
      contexts: ["action"],
    });

    Browser.contextMenus.create({
      id: HELP_MENU_ID,
      title:
        (await getTranslationString("context_menu_help")) || "Help & Support",
      contexts: ["action"],
    });
    logME("[ContextMenuSetup] Action context menus created successfully.");
  } catch (e) {
    logME("Error creating action context menus:", e);
  }
}

async function deactivateSelectElementModeInAllTabs(Browser) {
  try {
    const tabs = await Browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        // We send the message but don't wait for a response.
        // A try-catch block handles cases where content scripts aren't injected (e.g., on special pages).
        Browser.tabs
          .sendMessage(tab.id, {
            action: "TOGGLE_SELECT_ELEMENT_MODE",
            data: false, // `false` signals deactivation
          })
          .catch(() => {
            // It's normal for this to fail on tabs without the content script; ignore the error.
          });
      }
    }
    logME(
      "[ContextMenu] Sent deactivation signal for Select Element mode to all tabs."
    );
  } catch (e) {
    logME("Error trying to deactivate select element mode in all tabs:", e);
  }
}

export async function initialize(Browser) {
  // Listener for when a context menu item is clicked.
  Browser.contextMenus.onClicked.addListener(async (info, tab) => {
    logME(`[ContextMenu] Clicked menu item: ${info.menuItemId}`);

    // --- شناسایی و مدیریت کلیک روی منوی آیکون افزونه (Action Context) ---
    const isApiProviderClick = info.menuItemId.startsWith(
      API_PROVIDER_ITEM_ID_PREFIX
    );
    const isStaticActionClick = [
      ACTION_CONTEXT_MENU_OPTIONS_ID,
      ACTION_CONTEXT_MENU_SHORTCUTS_ID,
      HELP_MENU_ID,
    ].includes(info.menuItemId);

    // اگر روی هر کدام از آیتم‌های منوی آیکون افزونه کلیک شد، ابتدا حالت انتخاب را غیرفعال کن
    if (isApiProviderClick || isStaticActionClick) {
      await deactivateSelectElementModeInAllTabs(Browser);
    }

    // --- Handler for API Provider selection ---
    if (isApiProviderClick) {
      const newApiId = info.menuItemId.replace(API_PROVIDER_ITEM_ID_PREFIX, "");
      if (Browser.storage && Browser.storage.local) {
        try {
          await Browser.storage.local.set({ TRANSLATION_API: newApiId });
          logME(`[ContextMenu] API Provider changed to: ${newApiId}`);
        } catch (e) {
          logME(`[ContextMenu] Error setting new API provider:`, e);
        }
      } else {
        logME(`[ContextMenu] Browser.storage.local is not available. Cannot set API provider.`);
      }
      return; // Stop further processing
    }

    // --- Handler for other menu items ---
    switch (info.menuItemId) {
      case PAGE_CONTEXT_MENU_ID:
        if (tab && tab.id) {
          // این بخش فقط حالت انتخاب را فعال می‌کند و تحت تاثیر منطق غیرفعال کردن قرار نمی‌گیرد
          Browser.tabs
            .sendMessage(tab.id, {
              action: "TOGGLE_SELECT_ELEMENT_MODE",
              data: true,
            })
            .catch((err) => {
              logME(
                `[ContextMenu] Could not send message to tab ${tab.id}:`,
                err.message
              );
            });
        }
        break;
      case ACTION_CONTEXT_MENU_OPTIONS_ID:
        focusOrCreateTab(Browser.runtime.getURL("html/options.html"));
        break;
      case ACTION_CONTEXT_MENU_SHORTCUTS_ID:
        try {
          const browserInfo = await Browser.runtime.getBrowserInfo();
          const url =
            browserInfo.name === "Firefox" ?
              "html/options.html#help=shortcut"
            : "chrome://extensions/shortcuts";
          Browser.tabs.create({ url });
        } catch (e) {
          logME(
            "Could not determine browser type, opening for Chrome as default.",
            e
          );
          Browser.tabs.create({ url: "chrome://extensions/shortcuts" });
        }
        break;
      case HELP_MENU_ID:
        focusOrCreateTab(Browser.runtime.getURL("html/options.html#help"));
        break;
    }
  });

  /**
   * Listener to keep the context menu synchronized with storage changes.
   * This runs if the user changes the API from the options page.
   */
  if (Browser.storage && Browser.storage.onChanged) {
    Browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "local" && changes.TRANSLATION_API) {
        logME(
          "[ContextMenu] TRANSLATION_API setting changed in storage. Rebuilding context menus for synchronization."
        );
        setupContextMenus(Browser);
      }
    });
  } else {
    logME(`[ContextMenu] Browser.storage.onChanged is not available. Cannot synchronize context menus.`);
  }

  logME("[ContextMenu] Listeners are active.");
}
