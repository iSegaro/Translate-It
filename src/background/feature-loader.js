// src/background/feature-loader.js
// Dynamic feature loading based on browser capabilities

import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'feature-loader');

/**
 * Feature loader class
 * Dynamically loads appropriate implementations based on browser capabilities
 */
export class FeatureLoader {
  constructor() {
    this.loadedFeatures = new Map();
    this.loadingPromises = new Map();
  }

  // Legacy TTS manager loading removed - using unified GOOGLE_TTS_SPEAK system

  /**
   * Load side panel/sidebar manager based on browser capabilities
   * @returns {Promise<Object>} Panel manager instance
   */
  async loadPanelManager() {
    const cacheKey = "panel-manager";

    if (this.loadedFeatures.has(cacheKey)) {
      return this.loadedFeatures.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    const loadingPromise = this._loadPanelManagerImpl();
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const manager = await loadingPromise;
      this.loadedFeatures.set(cacheKey, manager);
      this.loadingPromises.delete(cacheKey);
      return manager;
    } catch (error) {
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Internal panel manager loading implementation
   * @private
   */
  async _loadPanelManagerImpl() {
    const capabilities =
      browser.runtime.getManifest().incognito === "spanning"
        ? { sidePanel: true }
        : { sidePanel: false }; // Simplified capability detection
    const panelSystem = capabilities.sidePanel
      ? "side_panel"
      : "sidebar_action"; // Simplified panel system selection

    logger.debug(`📋 Loading panel manager with system: ${panelSystem}`);

    try {
      if (panelSystem === "side_panel" && capabilities.sidePanel) {
        const { ChromeSidePanelManager } = await import(
          "../managers/browser-specific/panel/SidepanelManager.js"
        );
        return new ChromeSidePanelManager();
      } else {
        // Firefox sidebar or fallback
        const { FirefoxSidebarManager } = await import(
          "../managers/browser-specific/panel/SidebarManager.js"
        );
        return new FirefoxSidebarManager();
      }
    } catch (error) {
      logger.error("Failed to load panel manager:", error);
      // Fallback to basic implementation
      return {
        initialize: () => Promise.resolve(),
        open: () => logger.warn("Panel functionality not available"),
        close: () => logger.warn("Panel functionality not available"),
      };
    }
  }

  /**
   * Load screen capture manager based on browser capabilities
   * @returns {Promise<Object>} Screen capture manager instance
   */
  async loadScreenCaptureManager() {
    const cacheKey = "screen-capture-manager";

    if (this.loadedFeatures.has(cacheKey)) {
      return this.loadedFeatures.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    const loadingPromise = this._loadScreenCaptureManagerImpl();
    this.loadingPromises.set(cacheKey, loadingPromise);

    try {
      const manager = await loadingPromise;
      this.loadedFeatures.set(cacheKey, manager);
      this.loadingPromises.delete(cacheKey);
      return manager;
    } catch (error) {
      this.loadingPromises.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Internal screen capture manager loading implementation
   * @private
   */
  async _loadScreenCaptureManagerImpl() {
    const capabilities =
      browser.runtime.getManifest().incognito === "spanning"
        ? { offscreen: true }
        : { offscreen: false }; // Simplified capability detection
    const browserName = browser.runtime.getURL("").startsWith("chrome")
      ? "chrome"
      : "firefox"; // Simplified browser detection

    logger.debug(`📸 Loading screen capture manager for ${browserName}`);

    try {
      if (capabilities.offscreen && browser === "chrome") {
        const { OffscreenCaptureManager } = await import(
          "../managers/browser-specific/capture/CaptureOffscreen.js"
        );
        return new OffscreenCaptureManager();
      } else {
        const { ContentScriptCaptureManager } = await import(
          "../managers/capture-content.js"
        );
        return new ContentScriptCaptureManager();
      }
    } catch (error) {
      logger.error("Failed to load screen capture manager:", error);
      // Fallback to basic content script implementation
      const { ContentScriptCaptureManager } = await import(
        "../managers/capture-content.js"
      );
      return new ContentScriptCaptureManager();
    }
  }

  /**
   * Load context menu manager
   * @returns {Promise<Object>} Context menu manager instance
   */
  async loadContextMenuManager() {
    const cacheKey = "context-menu-manager";

    if (this.loadedFeatures.has(cacheKey)) {
      return this.loadedFeatures.get(cacheKey);
    }

    try {
      const { ContextMenuManager } = await import(
        "../managers/context-menu.js"
      );
      const manager = new ContextMenuManager();
      this.loadedFeatures.set(cacheKey, manager);
      return manager;
    } catch (error) {
      logger.error("Failed to load context menu manager:", error);
      throw error;
    }
  }

  /**
   * Pre-load all essential features
   * @returns {Promise<Object>} Object containing all loaded features
   */
  async preloadEssentialFeatures() {
    logger.debug("🚀 Pre-loading essential features...");

    const results = await Promise.allSettled([
      // TTS preloading removed - using unified GOOGLE_TTS_SPEAK system
      this.loadPanelManager(),
      this.loadScreenCaptureManager(),
      this.loadContextMenuManager(),
    ]);

    const features = {
      tts: null,
      panel: null,
      screenCapture: null,
      contextMenu: null,
    };

    const featureNames = ["tts", "panel", "screenCapture", "contextMenu"];

    results.forEach((result, index) => {
      const featureName = featureNames[index];

      if (result.status === "fulfilled") {
        features[featureName] = result.value;
        logger.debug(`✅ ${featureName} feature loaded successfully`);
      } else {
        logger.error(
          `❌ Failed to load ${featureName} feature:`,
          result.reason,
        );
      }
    });

    return features;
  }

  /**
   * Load a specific listener module
   * @param {string} listenerName - Name of the listener to load
   * @returns {Promise<Object>} Listener module
   */
  /**
   * @deprecated Legacy method - listeners are now managed by UnifiedListenerManager
   */
  async loadListener(listenerName) {
    logger.warn(
      `[FeatureLoader] loadListener(${listenerName}) is deprecated - listeners are now managed by UnifiedListenerManager`,
    );
    return null;
  }

  /**
   * Load all listeners
   * @returns {Promise<Array>} Array of loaded listener modules
   */
  /**
   * @deprecated Legacy method - listeners are now managed by UnifiedListenerManager
   */
  async loadAllListeners() {
    logger.warn(
      "[FeatureLoader] loadAllListeners is deprecated - listeners are now managed by UnifiedListenerManager",
    );
    return [];
  }

  /**
   * Get debug information about loaded features
   * @returns {Object} Debug information
   */
  getDebugInfo() {
    return {
      loadedFeatures: Array.from(this.loadedFeatures.keys()),
      loadingPromises: Array.from(this.loadingPromises.keys()),
      featureCount: this.loadedFeatures.size,
      environment: {},
    };
  }

  /**
   * Clear all loaded features (for testing/cleanup)
   */
  clearCache() {
    this.loadedFeatures.clear();
    this.loadingPromises.clear();
  }
}

// Export singleton instance
export const featureLoader = new FeatureLoader();