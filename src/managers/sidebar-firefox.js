// src/managers/sidebar-firefox.js
// Firefox sidebar manager (and fallback for other browsers)

import { getBrowserAPI } from '../utils/browser-unified.js';

/**
 * Firefox Sidebar Manager
 * Manages Firefox sidebar and provides fallback functionality
 */
export class FirefoxSidebarManager {
  constructor() {
    this.browser = null;
    this.initialized = false;
  }

  /**
   * Initialize the Firefox sidebar manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.browser = await getBrowserAPI();
      
      console.log('📋 Initializing Firefox sidebar manager');
      this.initialized = true;
      console.log('✅ Firefox sidebar manager initialized');

    } catch (error) {
      console.error('❌ Failed to initialize Firefox sidebar manager:', error);
      throw error;
    }
  }

  /**
   * Open sidebar (Firefox) or create new tab as fallback
   * @param {number} tabId - Tab ID (may not be used in Firefox sidebar)
   * @returns {Promise<void>}
   */
  async open(tabId) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Firefox sidebar opens automatically based on manifest sidebar_action
      // For manual opening, we can use tabs.create as fallback
      const sidebarUrl = this.browser.runtime.getURL('sidepanel.html');
      
      // Try to open as popup window (better than tab for sidebar-like experience)
      if (this.browser.windows) {
        await this.browser.windows.create({
          url: sidebarUrl,
          type: 'popup',
          width: 400,
          height: 600,
          left: screen.width - 420,
          top: 100
        });
        console.log('📋 Firefox sidebar opened as popup window');
      } else {
        // Fallback: open in new tab
        await this.browser.tabs.create({
          url: sidebarUrl,
          active: true
        });
        console.log('📋 Firefox sidebar opened in new tab');
      }

    } catch (error) {
      console.error('❌ Failed to open Firefox sidebar:', error);
      throw error;
    }
  }

  /**
   * Set panel behavior (no-op for Firefox, sidebar is always available)
   * @param {number} tabId - Tab ID
   * @param {string} behavior - Panel behavior
   */
  async setPanelBehavior(tabId, behavior = 'enabled') {
    // Firefox sidebar behavior is controlled by manifest
    // This is a no-op but we'll log for consistency
    console.log(`📋 Firefox sidebar behavior is always enabled (no-op)`);
  }

  /**
   * Check if sidebar functionality is available
   * @returns {boolean}
   */
  isAvailable() {
    return this.initialized;
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      type: 'firefox-sidebar',
      initialized: this.initialized,
      hasWindowsAPI: !!this.browser?.windows,
      hasTabsAPI: !!this.browser?.tabs
    };
  }
}