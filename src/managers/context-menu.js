// src/managers/context-menu.js
// Context menu manager for cross-browser compatibility

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { MessageActions } from '@/messaging/core/MessageActions.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'context-menu');

/**
 * Context Menu Manager
 * Handles context menu creation and management across browsers
 */
export class ContextMenuManager {
  constructor() {
    this.browser = null;
    this.initialized = false;
    this.createdMenus = new Set();
  }

  /**
   * Initialize the context menu manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      logger.debug("📋 Initializing context menu manager");

      // Set up default context menus
      await this.setupDefaultMenus();

      this.initialized = true;
      logger.debug("✅ Context menu manager initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize context menu manager:", error);
      throw error;
    }
  }

  /**
   * Set up default context menus
   * @private
   */
  async setupDefaultMenus() {
    try {
      // Clear existing menus first
      await this.clearAllMenus();

      // Main translation menu
      await this.createMenu({
        id: "translate-selection",
        title: 'Translate "%s"',
        contexts: ["selection"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });

      // Translate page menu
      await this.createMenu({
        id: "translate-page",
        title: "Translate this page",
        contexts: ["page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });

      // Element selection mode
      await this.createMenu({
        id: "select-element-mode",
        title: "Select element to translate",
        contexts: ["page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });

      // Separator
      await this.createMenu({
        id: "separator1",
        type: "separator",
        contexts: ["selection", "page"],
      });

      // Screen capture menu
      await this.createMenu({
        id: "capture-screen",
        title: "Capture and translate screen area",
        contexts: ["page"],
        documentUrlPatterns: ["http://*/*", "https://*/*"],
      });

      // Options menu
      await this.createMenu({
        id: "open-options",
        title: "Translation settings",
        contexts: ["action"],
      });

      logger.debug("✅ Default context menus created");
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
   * Handle context menu click
   * @param {Object} info - Click information
   * @param {Object} tab - Tab information
   */
  async handleMenuClick(info, tab) {
    try {
      logger.debug(`📋 Context menu clicked: ${info.menuItemId}`);

      switch (info.menuItemId) {
        case "translate-selection":
          await this.handleTranslateSelection(info, tab);
          break;

        case "translate-page":
          await this.handleTranslatePage(info, tab);
          break;

        case "select-element-mode":
          await this.handleSelectElementMode(info, tab);
          break;

        case "capture-screen":
          await this.handleCaptureScreen(info, tab);
          break;

        case "open-options":
          await this.handleOpenOptions(info, tab);
          break;

        default:
          logger.warn(`Unhandled context menu: ${info.menuItemId}`);
      }
    } catch (error) {
      logger.error("❌ Context menu click handler failed:", error);
    }
  }

  /**
   * Handle translate selection
   * @private
   */
  async handleTranslateSelection(info, tab) {
    if (!info.selectionText) return;

    try {
      // Send message to content script to handle translation
      await browser.tabs.sendMessage(tab.id, {
        action: MessageActions.TRANSLATE_SELECTION,
        source: "context-menu",
        data: {
          text: info.selectionText,
          pageUrl: info.pageUrl,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to handle translate selection:", error);
    }
  }

  /**
   * Handle translate page
   * @private
   */
  async handleTranslatePage(info, tab) {
    try {
      await browser.tabs.sendMessage(tab.id, {
        action: MessageActions.TRANSLATE_PAGE,
        source: "context-menu",
        data: {
          pageUrl: info.pageUrl,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to handle translate page:", error);
    }
  }

  /**
   * Handle select element mode
   * @private
   */
  async handleSelectElementMode(info, tab) {
    try {
      await browser.tabs.sendMessage(tab.id, {
        action: MessageActions.ACTIVATE_SELECT_ELEMENT_MODE,
        source: "context-menu",
        data: {
          pageUrl: info.pageUrl,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to handle select element mode:", error);
    }
  }

  /**
   * Handle screen capture
   * @private
   */
  async handleCaptureScreen(info, tab) {
    try {
      await browser.tabs.sendMessage(tab.id, {
        action: MessageActions.START_SCREEN_CAPTURE,
        source: "context-menu",
        data: {
          pageUrl: info.pageUrl,
        },
      });
    } catch (error) {
      logger.error("❌ Failed to handle screen capture:", error);
    }
  }

  /**
   * Handle open options
   * @private
   */
  async handleOpenOptions() {
    try {
      const optionsUrl = browser.runtime.getURL("options.html");
      await browser.tabs.create({ url: optionsUrl });
    } catch (error) {
      logger.error("❌ Failed to handle open options:", error);
    }
  }

  /**
   * Register context menu click listener
   */
  registerClickListener() {
    if (browser?.contextMenus?.onClicked) {
      browser.contextMenus.onClicked.addListener.call(
        browser.contextMenus.onClicked,
        this.handleMenuClick.bind(this),
      );
      logger.debug("📋 Context menu click listener registered");
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
    } catch (error) {
      logger.error("❌ Error during context menu cleanup:", error);
    }

    this.initialized = false;
    this.createdMenus.clear();
  }
}