// src/managers/context-menu.js
// Context menu manager for cross-browser compatibility

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';
import { getTranslationApiAsync } from '@/shared/config/config.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';
// Element selection handler will be loaded lazily when needed
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { tabPermissionChecker } from '@/core/tabPermissions.js';

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

    // Get all available providers (both loaded and lazy registered)
    const availableProviders = providerRegistry.getAllAvailable();

    // Log provider structure for debugging
    logger.info("Processing available providers for context menu", {
      totalProviders: availableProviders.length,
      lazyProviders: availableProviders.filter(p => p.isLazy).length,
      loadedProviders: availableProviders.filter(p => !p.isLazy).length
    });

    const validProviders = [];

    for (const provider of availableProviders) {
      // Handle both lazy providers and loaded provider classes
      let id, name;

      if (provider.isLazy) {
        // This is a lazy provider with metadata
        id = provider.id;
        name = provider.name;
      } else {
        // This is a loaded provider class - should have been filtered out at registry level
        // But we handle it defensively
        logger.warn("Unexpected loaded provider class found in context menu:", provider.constructor?.name);
        continue;
      }

      // Validate required fields
      if (!id || !name) {
        logger.warn("Provider missing required id or name:", { id, name, provider });
        continue;
      }

      // Validate field types
      if (typeof id !== 'string' || typeof name !== 'string') {
        logger.warn("Provider id or name is not a string:", { id, name, provider });
        continue;
      }

      // Validate field content
      if (id.includes('undefined') || name.includes('undefined')) {
        logger.warn("Provider id or name contains undefined:", { id, name });
        continue;
      }

      // Validate ID format - should match registered provider IDs
      if (!/^[a-z][a-z0-9_-]*$/i.test(id)) {
        logger.warn("Provider ID doesn't match expected format:", { id, name });
        continue;
      }

      // Validate name content
      if (name.length < 2 || name.length > 50) {
        logger.warn("Provider name length seems invalid:", { id, name });
        continue;
      }

      // Check against known provider IDs for extra validation
      const knownProviderIds = [
        'google', 'yandex', 'deepl', 'gemini', 'openai', 'openrouter',
        'deepseek', 'webai', 'bing', 'browser', 'custom'
      ];

      if (!knownProviderIds.includes(id.toLowerCase())) {
        logger.warn("Unknown provider ID detected:", { id, name });
        // Don't filter out unknown providers, just warn - they might be newly added
      }

      validProviders.push({
        id: id.toLowerCase(), // Normalize ID to lowercase
        defaultTitle: name
      });
    }

    // Remove duplicates based on id (case-insensitive)
    const uniqueProviders = [];
    const seenIds = new Set();

    for (const provider of validProviders) {
      const normalizedId = provider.id.toLowerCase();
      if (!seenIds.has(normalizedId)) {
        seenIds.add(normalizedId);
        uniqueProviders.push({
          ...provider,
          id: normalizedId // Ensure consistent case
        });
      } else {
        logger.warn(`Removing duplicate provider with id: ${provider.id}`);
      }
    }

    logger.debug("Final provider list created", {
      providerCount: uniqueProviders.length,
      providers: uniqueProviders.map(p => p.id)
    });
    return uniqueProviders;
  } catch (error) {
    logger.error("Failed to get providers dynamically, using fallback:", error);

    // Fallback to basic provider list if dynamic loading fails
    return [
      { id: "google", defaultTitle: "Google Translate" },
      { id: "yandex", defaultTitle: "Yandex Translate" },
      { id: "deepl", defaultTitle: "DeepL Translate" },
      { id: "gemini", defaultTitle: "Google Gemini" },
      { id: "openai", defaultTitle: "OpenAI" },
      { id: "openrouter", defaultTitle: "OpenRouter" },
      { id: "deepseek", defaultTitle: "DeepSeek" },
      { id: "webai", defaultTitle: "WebAI" },
      { id: "bing", defaultTitle: "Bing Translate" },
      { id: "browser", defaultTitle: "Browser API" },
      { id: "custom", defaultTitle: "Custom Provider" }
    ];
  }
}

/**
 * Sends a message to all tabs to deactivate the "Select Element" mode.
 * This is useful for ensuring a consistent state when the user interacts with the browser action menu.
 */
async function deactivateSelectElementModeInAllTabs() {
  try {
    const tabs = await browser.tabs.query({});
    let processedTabs = 0;

    for (const tab of tabs) {
      if (tab.id) {
        try {
          // Check if tab is accessible before sending message
          const tabAccess = await tabPermissionChecker.checkTabAccess(tab.id);

          if (tabAccess.isAccessible) {
            // We send the message but don't wait for a response.
            // A try-catch block handles cases where content scripts aren't injected.
            browser.tabs
              .sendMessage(tab.id, MessageFormat.create(
                MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE,
                { forceDeactivate: true },
                'context-menu'
              ))
              .catch(() => {
                // It's normal for this to fail on tabs without the content script; ignore the error.
              });
            processedTabs++;
          } else {
            logger.debug(`Skipping deactivation for restricted tab ${tab.id}: ${tabAccess.errorMessage}`);
          }
        } catch (permError) {
          logger.debug(`Error checking permissions for tab ${tab.id}, skipping:`, permError);
        }
      }
    }

    logger.info(
      "Sent deactivation signal for Select Element mode to accessible tabs",
      {
        totalTabs: tabs.length,
        processedTabs,
        skippedTabs: tabs.length - processedTabs
      }
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

      logger.info("Initializing context menu manager", force ? '(forced)' : '');

      // Set up default context menus (this clears existing ones)
      await this.setupDefaultMenus(locale);

      // Register storage listener only if not already registered
      if (!this.initialized) {
        this.registerStorageListener();
      }

      this.initialized = true;
      logger.info("✅ Context menu manager initialized");
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
  _pendingSetupPromise = null;
  async setupDefaultMenus(locale = null) {
    logger.debug("🔧 [ContextMenuManager] Starting setupDefaultMenus...");

    // Global lock to prevent any race conditions across the entire extension
    if (this._menuSetupLock) {
      logger.debug("setupDefaultMenus called concurrently, waiting for existing setup to complete");
      // If there's a pending setup, wait for it instead of skipping
      if (this._pendingSetupPromise) {
        await this._pendingSetupPromise;
      }
      return;
    }

    this._menuSetupLock = true;

    // Store the promise so concurrent calls can wait for it
    this._pendingSetupPromise = this._setupMenusInternal(locale);

    try {
      await this._pendingSetupPromise;
    } finally {
      this._menuSetupLock = false;
      this._pendingSetupPromise = null;
    }
  }

  /**
   * Internal implementation of menu setup (separated for proper locking)
   * @private
   */
  async _setupMenusInternal(locale) {
    try {
      // Get i18n utility from factory
      const { getTranslationString } = await utilsFactory.getI18nUtils();

      // Clear existing menus first and wait for completion
      // Increase delay to ensure removeAll() fully completes before creating new menus
      // This prevents "duplicate id" errors from Chrome
      await browser.contextMenus.removeAll();

      // Verify menus are cleared by waiting longer
      await new Promise(resolve => setTimeout(resolve, 200));

      // Double-check that all menus are cleared
      try {
        const existingMenus = await browser.contextMenus.getAll();
        if (existingMenus.length > 0) {
          logger.warn(`Found ${existingMenus.length} menus still after removeAll(), clearing again`);
          await browser.contextMenus.removeAll();
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (e) {
        logger.debug("Could not verify menu removal:", e);
      }

      this.createdMenus.clear();
      logger.debug("[ContextMenuManager] Cleared existing menus and verified");

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
        logger.debug(`Created page context menu: "${pageMenuTitle}"`);
      } catch (e) {
        logger.error("Error creating page context menu:", e);
      }

      // --- 2. Create Action (Browser Action) Context Menus ---
      try {
        logger.debug("🎯 [ContextMenuManager] Creating Action (Browser Action) menus...");

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
        logger.debug(`Created Translate Element action menu: "${actionPageMenuTitle}"`);

        // --- API Provider Parent Menu ---
        await this.createMenu({
          id: API_PROVIDER_PARENT_ID,
          title:
            (await getTranslationString("context_menu_api_provider", locale)) ||
            "API Provider",
          contexts: ["action"],
        });
        logger.debug("Created API Provider parent menu");

        // --- API Provider Sub-Menus (Radio Buttons) ---
        const apiProviders = await getApiProviders();
        logger.debug(`📊 [ContextMenuManager] Found ${apiProviders.length} providers`);

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
          `Created ${apiProviders.length} API Provider sub-menus. Current API: ${currentApi}`
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

      logger.info("✅ Default context menus created");
    } catch (error) {
      logger.error("❌ Failed to setup default menus:", error);
      throw error;
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

      // IMPORTANT: Immediately check and clear runtime.lastError to prevent console warnings
      // In Chrome, some errors are stored in runtime.lastError instead of being thrown
      // We must access chrome.runtime.lastError synchronously right after the async call
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError) {
        const lastError = chrome.runtime.lastError;

        // Check if this is a duplicate ID error - log at debug level and don't fail
        if (lastError.message && lastError.message.includes('duplicate id')) {
          logger.debug(`Context menu with duplicate ID "${menuConfig.id}" already exists (chrome.runtime.lastError), skipping`);
          // Accessing lastError clears it
          return menuConfig.id; // Return the ID without failing
        }

        // For other errors, log them
        logger.warn(`Context menu created but chrome.runtime.lastError was set:`, lastError);
        // Accessing lastError clears it
      }

      // Also check browser runtime.lastError for polyfill scenarios
      if (this.browser.runtime && this.browser.runtime.lastError) {
        const lastError = this.browser.runtime.lastError;

        // Check if this is a duplicate ID error - log at debug level and don't fail
        if (lastError.message && lastError.message.includes('duplicate id')) {
          logger.debug(`Context menu with duplicate ID "${menuConfig.id}" already exists (runtime.lastError), skipping`);
          // lastError will be cleared automatically on next API call
          return menuConfig.id; // Return the ID without failing
        }

        // For other errors, log them
        logger.warn(`Context menu created but runtime.lastError was set:`, lastError);
        // lastError will be cleared automatically on next API call
      }

      this.createdMenus.add(menuConfig.id || menuId);

      logger.debug(
        `📋 Created context menu: ${menuConfig.title || menuConfig.id}`,
      );
      return menuId;
    } catch (error) {
      // Check if this is a duplicate ID error - if so, log but don't fail
      if (error.message && error.message.includes('duplicate id')) {
        logger.debug(`⚠️ Context menu with duplicate ID "${menuConfig.id}" already exists (exception), skipping:`, error);
        return menuConfig.id; // Return the ID without failing
      }

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

      logger.info("Cleared all context menus");
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
      // Check if tab is accessible before attempting activation
      const tabAccess = await tabPermissionChecker.checkTabAccess(tab.id);

      if (!tabAccess.isAccessible) {
        logger.warn(`Cannot activate select element mode for tab ${tab.id}: ${tabAccess.errorMessage}`);
        return;
      }

      logger.info(`Activating select mode for tab ${tab.id} via central handler`);
      const message = {
        action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
        context: 'context-menu',
        data: { active: true, tabId: tab.id }
      };
      const sender = { tab };

      // Load Element Selection handler lazily
      const { handleActivateSelectElementModeLazy } = await import('@/core/background/handlers/lazy/handleElementSelectionLazy.js');
      await handleActivateSelectElementModeLazy(message, sender);
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
      logger.info(`📋 Context menu clicked: ${info.menuItemId}`);

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
          logger.info(`API Provider changed to: ${newApiId}`);
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
            let url;

            // Check if current tab is accessible and determine appropriate shortcuts URL
            const [activeTab] = await browser.tabs.query({ active: true, currentWindow: true });

            if (activeTab) {
              // Check if current tab is accessible before determining shortcuts URL
              const tabAccess = await tabPermissionChecker.checkTabAccess(activeTab.id);

              if (!tabAccess.isAccessible) {
                logger.debug(`Current tab is restricted (${tabAccess.errorMessage}), using fallback shortcuts URL`);
              }

              if (browser.runtime && typeof browser.runtime.getBrowserInfo === 'function') {
                try {
                  const browserInfo = await browser.runtime.getBrowserInfo();
                  if (browserInfo.name === "Firefox") {
                    // Use extension's options page for Firefox with query param
                    url = browser.runtime.getURL("html/options.html?tab=shortcuts");
                  } else {
                    // Use Chrome shortcuts page
                    url = "chrome://extensions/shortcuts";
                  }
                } catch (browserInfoError) {
                  logger.debug("Browser info not available, using default Chrome shortcuts URL", browserInfoError);
                  url = "chrome://extensions/shortcuts";
                }
              } else {
                // Fallback to Chrome shortcuts
                url = "chrome://extensions/shortcuts";
              }
            } else {
              // No active tab, use default behavior
              url = "chrome://extensions/shortcuts";
            }

            await browser.tabs.create({ url });
          } catch (e) {
            logger.error("Could not open shortcuts page:", e);
            // Final fallback - try to open options page instead
            try {
              await browser.tabs.create({ url: browser.runtime.getURL("html/options.html?tab=shortcuts") });
            } catch (fallbackError) {
              logger.error("Failed to open fallback shortcuts page:", fallbackError);
            }
          }
          break;

        case HELP_MENU_ID:
          // Check browser type for proper help navigation
          if (browser.runtime && typeof browser.runtime.getBrowserInfo === 'function') {
            try {
              const browserInfo = await browser.runtime.getBrowserInfo();
              if (browserInfo.name === "Firefox") {
                // Use query parameter for Firefox to ensure proper tab selection
                await focusOrCreateTab(browser.runtime.getURL("html/options.html?tab=help"));
              } else {
                // Use hash for Chrome and other browsers
                await focusOrCreateTab(browser.runtime.getURL("html/options.html#help"));
              }
            } catch (browserInfoError) {
              logger.debug("Browser info not available, using default hash URL", browserInfoError);
              await focusOrCreateTab(browser.runtime.getURL("html/options.html#help"));
            }
          } else {
            // Fallback to hash URL
            await focusOrCreateTab(browser.runtime.getURL("html/options.html#help"));
          }
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
          logger.info(
            "TRANSLATION_API setting changed in storage. Rebuilding context menus for synchronization."
          );
          this.setupDefaultMenus();
        }
      };
      browser.storage.onChanged.addListener(this.storageListener);
      logger.info("📋 Storage change listener registered");
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
    logger.info("🧹 Cleaning up context menu manager");

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