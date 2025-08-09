// src/managers/sidepanel-chrome.js
// Chrome side panel manager

import browser from "webextension-polyfill";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'SidepanelManager');

/**
 * Chrome Side Panel Manager
 * Manages Chrome's native side panel functionality
 */
export class ChromeSidePanelManager {
  constructor() {
    this.browser = null;
    this.initialized = false;
  }

  /**
   * Initialize the Chrome side panel manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = browser;

      if (!browser.sidePanel) {
        throw new Error("Chrome sidePanel API not available");
      }

      logger.debug("📋 Initializing Chrome side panel manager");
      this.initialized = true;
      logger.debug("✅ Chrome side panel manager initialized");
    } catch (error) {
      logger.error(
        "❌ Failed to initialize Chrome side panel manager:",
        error,
      );
      throw error;
    }
  }

  /**
   * Open side panel
   * @param {number} tabId - Tab ID to open panel for
   * @returns {Promise<void>}
   */
  async open(tabId) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await browser.sidePanel.open({ tabId });
      logger.debug("📋 Chrome side panel opened");
    } catch (error) {
      logger.error("❌ Failed to open Chrome side panel:", error);
      throw error;
    }
  }

  /**
   * Set panel behavior for a tab
   * @param {number} tabId - Tab ID
   * @param {string} behavior - Panel behavior ('enabled' | 'disabled')
   */
  async setPanelBehavior(tabId, behavior = "enabled") {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      await browser.sidePanel.setPanelBehavior({
        tabId,
        openPanelOnActionClick: behavior === "enabled",
      });
      logger.debug(`📋 Side panel behavior set to ${behavior} for tab ${tabId}`);
    } catch (error) {
      logger.error("❌ Failed to set side panel behavior:", error);
    }
  }

  /**
   * Check if side panel is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized && !!this.browser?.sidePanel;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: "chrome-sidepanel",
      initialized: this.initialized,
      hasSidePanelAPI: !!this.browser?.sidePanel,
    };
  }
}