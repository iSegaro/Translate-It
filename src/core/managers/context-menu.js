// src/managers/context-menu.js
// Context menu manager for cross-browser compatibility

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { getTranslationApiAsync } from '@/shared/config/config.js';
import { getTranslationString } from '@/utils/i18n/i18n.js';
import { handleActivateSelectElementMode } from '@/features/element-selection/handlers/handleActivateSelectElementMode.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'context-menu');

// --- Constants for Menu Item IDs ---
const PAGE_CONTEXT_MENU_ID = "translate-with-select-element";
const ACTION_TRANSLATE_ELEMENT_ID = "action-translate-element";
const ACTION_CONTEXT_MENU_OPTIONS_ID = "open-options-page";
const ACTION_CONTEXT_MENU_SHORTCUTS_ID = "open-shortcuts-page";
const HELP_MENU_ID = "open-help-page";
const API_PROVIDER_PARENT_ID = "api-provider-parent";
const API_PROVIDER_ITEM_ID_PREFIX = "api-provider-";

// --- Get API Providers from Registry ---
async function getApiProviders() {
  try {
    const { providerRegistry } = await import('@/features/translation/providers/ProviderRegistry.js');
    return Array.from(providerRegistry.providers.entries()).map(([id, ProviderClass]) => ({
      id,
      defaultTitle: ProviderClass.displayName || id
    }));
  } catch (error) {
    logger.error("Failed to get providers dynamically, using fallback:", error);
    return [];
  }
}

/**
 * Sends a message to all tabs to deactivate the "Select Element" mode.
 * This is useful for ensuring a consistent state when the user interacts with the browser action menu.
 */
async function deactivateSelectElementModeInAllTabs() {
  try {
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        // We send the message but don't wait for a response.
        // A try-catch block handles cases where content scripts aren't injected (e.g., on special pages).
        browser.tabs
          .sendMessage(tab.id, MessageFormat.create(
            MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
            { forceDeactivate: true },
            'context-menu'
          ))
          .catch(() => {
            // It's normal for this to fail on tabs without the content script; ignore the error.
          });
      }
    }
    logger.debug(
      "Sent deactivation signal for Select Element mode to all tabs."
    );
  } catch (e) {
    logger.error("Error trying to deactivate select element mode in all tabs:", e);
  }
}

/**
 * Helper function to focus or create a tab
 */
async function focusOrCreateTab(url) {
  try {
    const tabs = await browser.tabs.query({ url });
    if (tabs.length > 0) {
      await browser.tabs.update(tabs[0].id, { active: true });
      await browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      await browser.tabs.create({ url });
    }
  } catch (error) {
    logger.error("Failed to focus or create tab:", error);
    // Fallback: just create a new tab
    await browser.tabs.create({ url });
  }
}

/**
 * Context Menu Manager
 * Handles context menu creation and management across browsers
 */
export class ContextMenuManager extends ResourceTracker {
  constructor() {
    super('context-menu-manager');
    this.browser = null;
    this.initialized = false;
    this.createdMenus = new Set();
    this.storageListener = null;
  }

  /**
   * Initialize the context menu manager
   * @param {boolean} force - Force re-initialization even if already initialized
   * @param {string} locale - Specific locale to use for translations
   */
  async initialize(force = false, locale = null) {
    if (this.initialized && !force) return;

    try {
      this.browser = browser;

      logger.debug("📋 Initializing context menu manager", force ? '(forced)' : '');

      // Set up default context menus (this clears existing ones)
      await this.setupDefaultMenus(locale);

      // Register storage listener only if not already registered
      if (!this.initialized) {
        this.registerStorageListener();
      }

      this.initialized = true;
      logger.debug("✅ Context menu manager initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize context menu manager:", error);
      throw error;
    }
  }

  /**
   * Set up default context menus
   * @param {string} locale - Specific locale to use for translations
   * @private
   */
  // Prevent concurrent menu setup
  _menuSetupLock = false;
  async setupDefaultMenus(locale = null) {
    if (this._menuSetupLock) {
      logger.warn("setupDefaultMenus called concurrently, skipping.");
      return;
    }
    this._menuSetupLock = true;
    try {
      // Clear existing menus first and wait for completion
      await browser.contextMenus.removeAll();
      this.createdMenus.clear();

      // Get the currently active API to set the 'checked' state
      const currentApi = await getTranslationApiAsync();
      
      // Get commands for keyboard shortcuts
      const commands = await browser.commands.getAll();

      // --- 1. Create Page Context Menu ---
      try {
        let pageMenuTitle =
          (await getTranslationString("context_menu_translate_with_selection", locale)) ||
          "Translate Element";
        const command = commands.find((c) => c.name === "SELECT-ELEMENT-COMMAND");
        if (command && command.shortcut) {
          pageMenuTitle = `${pageMenuTitle} (${command.shortcut})`;
        }
        await this.createMenu({
          id: PAGE_CONTEXT_MENU_ID,
          title: pageMenuTitle,
          contexts: ["page", "selection", "link", "image", "video", "audio"],
        });
        logger.debug(
          `Page context menu created with title: "${pageMenuTitle}"`
        );
      } catch (e) {
        logger.error("Error creating page context menu:", e);
      }

      // --- 2. Create Action (Browser Action) Context Menus ---
      try {
        // --- Translate Element Menu (First option) ---
        let actionPageMenuTitle =
          (await getTranslationString("context_menu_translate_with_selection", locale)) ||
          "Translate Element";
        const command = commands.find((c) => c.name === "SELECT-ELEMENT-COMMAND");
        if (command && command.shortcut) {
          actionPageMenuTitle = `${actionPageMenuTitle} (${command.shortcut})`;
        }
        await this.createMenu({
          id: ACTION_TRANSLATE_ELEMENT_ID,
          title: actionPageMenuTitle,
          contexts: ["action"],
        });

        // --- API Provider Parent Menu ---
        await this.createMenu({
          id: API_PROVIDER_PARENT_ID,
          title:
            (await getTranslationString("context_menu_api_provider", locale)) ||
            "API Provider",
          contexts: ["action"],
        });

        // --- API Provider Sub-Menus (Radio Buttons) ---
        const apiProviders = await getApiProviders();
        for (const provider of apiProviders) {
          await this.createMenu({
            id: `${API_PROVIDER_ITEM_ID_PREFIX}${provider.id}`,
            parentId: API_PROVIDER_PARENT_ID,
            title: provider.defaultTitle,
            type: "radio",
            checked: provider.id === currentApi,
            contexts: ["action"],
          });
        }
        logger.debug(
          `API Provider sub-menus created. Current API: ${currentApi}`
        );

        // --- Options Menu ---
        await this.createMenu({
          id: ACTION_CONTEXT_MENU_OPTIONS_ID,
          title: (await getTranslationString("context_menu_options", locale)) || "Options",
          contexts: ["action"],
        });

        // --- Separator ---
        await this.createMenu({
          id: "action-separator-1",
          type: "separator",
          contexts: ["action"],
        });

        // --- Other Action Menus ---
        await this.createMenu({
          id: ACTION_CONTEXT_MENU_SHORTCUTS_ID,
          title:
            (await getTranslationString("context_menu_shortcuts", locale)) ||
            "Manage Shortcuts",
          contexts: ["action"],
        });

        await this.createMenu({
          id: HELP_MENU_ID,
          title:
            (await getTranslationString("context_menu_help", locale)) || "Help & Support",
          contexts: ["action"],
        });
        logger.debug("Action context menus created successfully.");
      } catch (e) {
        logger.error("Error creating action context menus:", e);
      }

      logger.debug("✅ Default context menus created");
    } catch (error) {
      logger.error("❌ Failed to setup default menus:", error);
      throw error;
    } finally {
      this._menuSetupLock = false;
    }
  }

  /**
   * Create a context menu item
   * @param {Object} menuConfig - Menu configuration
   * @returns {Promise<string>} Menu item ID
   */
  async createMenu(menuConfig) {
    // Use browser API check instead of initialized check to avoid recursion
    if (!this.browser) {
      this.browser = browser;
    }

    try {
      const menuId = await this.browser.contextMenus.create(menuConfig);
      this.createdMenus.add(menuConfig.id || menuId);

      logger.debug(
        `📋 Created context menu: ${menuConfig.title || menuConfig.id}`,
      );
      return menuId;
    } catch (error) {
      logger.error("❌ Failed to create context menu:", error);
      throw error;
    }
  }

  /**
   * Update a context menu item
   * @param {string} menuId - Menu item ID
   * @param {Object} updateInfo - Updated menu properties
   */
  async updateMenu(menuId, updateInfo) {
    // Use browser API check instead of initialized check to avoid recursion
    if (!this.browser) {
      this.browser = browser;
    }

    try {
      await this.browser.contextMenus.update(menuId, updateInfo);
      logger.debug(`📋 Updated context menu: ${menuId}`);
    } catch (error) {
      logger.error(`❌ Failed to update context menu ${menuId}:`, error);
      throw error;
    }
  }

  /**
   * Remove a context menu item
   * @param {string} menuId - Menu item ID to remove
   */
  async removeMenu(menuId) {
    // Use browser API check instead of initialized check to avoid recursion
    if (!this.browser) {
      this.browser = browser;
    }

    try {
      await this.browser.contextMenus.remove(menuId);
      this.createdMenus.delete(menuId);

      logger.debug(`📋 Removed context menu: ${menuId}`);
    } catch (error) {
      logger.error(`❌ Failed to remove context menu ${menuId}:`, error);
      throw error;
    }
  }

  /**
   * Clear all context menus
   */
  async clearAllMenus() {
    // Use browser API check instead of initialized check to avoid recursion
    if (!this.browser) {
      this.browser = browser;
    }

    try {
      await this.browser.contextMenus.removeAll();
      this.createdMenus.clear();

      logger.debug("📋 Cleared all context menus");
    } catch (error) {
      logger.error("❌ Failed to clear context menus:", error);
      throw error;
    }
  }

  /**
   * Helper to activate select element mode via the central handler
   * @param {Object} tab - The tab to activate the mode in
   */
  async _activateSelectElement(tab) {
    if (!tab || !tab.id) return;

    try {
      logger.debug(`Activating select mode for tab ${tab.id} via central handler`);
      const message = {
        action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
        context: 'context-menu',
        data: { active: true, tabId: tab.id }
      };
      const sender = { tab };
      await handleActivateSelectElementMode(message, sender);
    } catch (error) {
      logger.error(`Could not activate select element mode for tab ${tab.id}:`, error);
    }
  }

  /**
   * Handle context menu click
   * @param {Object} info - Click information
   * @param {Object} tab - Tab information
   */
  async handleMenuClick(info, tab) {
    try {
      logger.debug(`📋 Context menu clicked: ${info.menuItemId}`);

      // --- Handle browser action menu clicks ---
      const isApiProviderClick = info.menuItemId.startsWith(
        API_PROVIDER_ITEM_ID_PREFIX
      );
      const isStaticActionClick = [
        ACTION_CONTEXT_MENU_OPTIONS_ID,
        ACTION_CONTEXT_MENU_SHORTCUTS_ID,
        HELP_MENU_ID,
      ].includes(info.menuItemId);

      // Deactivate select element mode when clicking on browser action menu items
      if (isApiProviderClick || isStaticActionClick) {
        await deactivateSelectElementModeInAllTabs();
      }

      // --- Handler for API Provider selection ---
      if (isApiProviderClick) {
        const newApiId = info.menuItemId.replace(API_PROVIDER_ITEM_ID_PREFIX, "");
        try {
          await storageManager.set({ TRANSLATION_API: newApiId });
          logger.debug(`API Provider changed to: ${newApiId}`);
          // Refresh context menus to update radio button states
          await this.setupDefaultMenus();
        } catch (e) {
          logger.error(`Error setting new API provider:`, e);
        }
        return; // Stop further processing
      }

      // --- Handle specific menu items ---
      switch (info.menuItemId) {
        case PAGE_CONTEXT_MENU_ID:
          await this._activateSelectElement(tab);
          break;

        case ACTION_TRANSLATE_ELEMENT_ID: {
          const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });
          await this._activateSelectElement(activeTab);
          break;
        }

        case ACTION_CONTEXT_MENU_OPTIONS_ID:
          await focusOrCreateTab(browser.runtime.getURL("html/options.html"));
          break;

        case ACTION_CONTEXT_MENU_SHORTCUTS_ID:
          try {
            const browserInfo = await browser.runtime.getBrowserInfo();
            const url =
              browserInfo.name === "Firefox" ?
                browser.runtime.getURL("html/options.html#help=shortcut")
              : "chrome://extensions/shortcuts";
            await browser.tabs.create({ url });
          } catch (e) {
            logger.error(
              "Could not determine browser type, opening for Chrome as default.",
              e
            );
            await browser.tabs.create({ url: "chrome://extensions/shortcuts" });
          }
          break;

        case HELP_MENU_ID:
          await focusOrCreateTab(browser.runtime.getURL("html/options.html#help"));
          break;


        default:
          logger.warn(`Unhandled context menu: ${info.menuItemId}`);
      }
    } catch (error) {
      logger.error("❌ Context menu click handler failed:", error);
    }
  }


  /**
   * Register storage change listener to sync context menus
   */
  registerStorageListener() {
    if (browser?.storage?.onChanged) {
      this.storageListener = (changes, areaName) => {
        if (areaName === "local" && changes.TRANSLATION_API) {
          logger.debug(
            "TRANSLATION_API setting changed in storage. Rebuilding context menus for synchronization."
          );
          this.setupDefaultMenus();
        }
      };
      browser.storage.onChanged.addListener(this.storageListener);
      logger.debug("📋 Storage change listener registered");
    }
  }

  /**
   * Check if context menu manager is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && !!this.browser?.contextMenus;
  }

  /**
   * Get list of created menu IDs
   * @returns {Array<string>}
   */
  getCreatedMenus() {
    return Array.from(this.createdMenus);
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: "context-menu",
      initialized: this.initialized,
      createdMenus: this.getCreatedMenus(),
      hasContextMenusAPI: !!this.browser?.contextMenus,
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    logger.debug("🧹 Cleaning up context menu manager");

    try {
      await this.clearAllMenus();
      
      // Remove storage listener
      if (this.storageListener && browser?.storage?.onChanged) {
        browser.storage.onChanged.removeListener(this.storageListener);
        this.storageListener = null;
      }
    } catch (error) {
      logger.error("❌ Error during context menu cleanup:", error);
    }

    this.initialized = false;
    this.createdMenus.clear();
    
    super.cleanup();
  }
}