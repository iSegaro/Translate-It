// src/background/feature-loader.js
// Dynamic feature loading based on browser capabilities

// Legacy listeners removed - now managed by UnifiedListenerManager
const listenerModules = {};

/**
 * Feature loader class
 * Dynamically loads appropriate implementations based on browser capabilities
 */
export class FeatureLoader {
  constructor() {
    this.loadedFeatures = new Map();
    this.loadingPromises = new Map();
  }

  /**
   * Load TTS manager based on browser capabilities
   * @returns {Promise<Object>} TTS manager instance
   */
  async loadTTSManager() {
    const cacheKey = "tts-manager";

    if (this.loadedFeatures.has(cacheKey)) {
      return this.loadedFeatures.get(cacheKey);
    }

    if (this.loadingPromises.has(cacheKey)) {
      return this.loadingPromises.get(cacheKey);
    }

    const loadingPromise = this._loadTTSManagerImpl();
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
   * Internal TTS manager loading implementation
   * @private
   */
  async _loadTTSManagerImpl() {
    // Use the official browser.offscreen API for capability detection
    const hasOffscreen = typeof browser.offscreen?.hasDocument === "function";
    console.log(`🔊 Checking for Offscreen API. Available: ${hasOffscreen}`);

    if (hasOffscreen) {
      try {
        console.log("Attempting to load OffscreenTTSManager...");
        const { OffscreenTTSManager } = await import(
          "../managers/tts-offscreen.js"
        );
        const manager = new OffscreenTTSManager();
        await manager.initialize();
        console.log("✅ OffscreenTTSManager initialized successfully.");
        return manager;
      } catch (error) {
        console.warn(
          "Offscreen TTS initialization failed, falling back to background page TTS:",
          error,
        );
        // Fallback to background if offscreen fails for any reason
      }
    } else {
      console.log(
        "Offscreen API not available, proceeding with background page TTS.",
      );
    }

    // Fallback for Firefox or if offscreen fails
    try {
      console.log("Attempting to load BackgroundTTSManager...");
      const { BackgroundTTSManager } = await import(
        "../managers/tts-background.js"
      );
      const manager = new BackgroundTTSManager();
      await manager.initialize();
      console.log("✅ BackgroundTTSManager initialized successfully.");
      return manager;
    } catch (error) {
      console.error(
        "❌ Failed to load BackgroundTTSManager, falling back to content script TTS:",
        error,
      );
      // Ultimate fallback
      const { ContentScriptTTSManager } = await import(
        "../managers/tts-content.js"
      );
      return new ContentScriptTTSManager();
    }
  }

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

    console.log(`📋 Loading panel manager with system: ${panelSystem}`);

    try {
      if (panelSystem === "side_panel" && capabilities.sidePanel) {
        const { ChromeSidePanelManager } = await import(
          "../managers/sidepanel-chrome.js"
        );
        return new ChromeSidePanelManager();
      } else {
        // Firefox sidebar or fallback
        const { FirefoxSidebarManager } = await import(
          "../managers/sidebar-firefox.js"
        );
        return new FirefoxSidebarManager();
      }
    } catch (error) {
      console.error("Failed to load panel manager:", error);
      // Fallback to basic implementation
      return {
        initialize: () => Promise.resolve(),
        open: () => console.warn("Panel functionality not available"),
        close: () => console.warn("Panel functionality not available"),
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

    console.log(`📸 Loading screen capture manager for ${browserName}`);

    try {
      if (capabilities.offscreen && browser === "chrome") {
        const { OffscreenCaptureManager } = await import(
          "../managers/capture-offscreen.js"
        );
        return new OffscreenCaptureManager();
      } else {
        const { ContentScriptCaptureManager } = await import(
          "../managers/capture-content.js"
        );
        return new ContentScriptCaptureManager();
      }
    } catch (error) {
      console.error("Failed to load screen capture manager:", error);
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
      console.error("Failed to load context menu manager:", error);
      throw error;
    }
  }

  /**
   * Pre-load all essential features
   * @returns {Promise<Object>} Object containing all loaded features
   */
  async preloadEssentialFeatures() {
    console.log("🚀 Pre-loading essential features...");

    const results = await Promise.allSettled([
      this.loadTTSManager(),
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
        console.log(`✅ ${featureName} feature loaded successfully`);
      } else {
        console.error(
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
  async loadListener(listenerName, browser) {
    console.warn(
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
    console.warn(
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
