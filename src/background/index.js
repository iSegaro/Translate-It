// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import browser from "webextension-polyfill";
import { featureLoader } from "./feature-loader.js";
import { VueMessageHandler } from "./vue-message-handler.js";
import NotificationManager from "../managers/NotificationManager.js";
import { initializeSettingsListener } from "../config.js";
import { TranslationEngine } from "./translation-engine.js";
import { simpleMessageHandler } from "../core/SimpleMessageHandler.js";
import * as Handlers from "./handlers/index.js";
import { triggerTestInstallation } from "../handlers/installation-handler.js";

/**
 * Background Service class
 * Manages extension background functionality across browsers
 */
class BackgroundService {
  constructor() {
    this.initialized = false;
    this.browser = null;
    this.features = {};
    this.listeners = [];
    this.vueMessageHandler = null;
    this.translationEngine = null;
    this.messageHandler = simpleMessageHandler;
    // Ensure SimpleMessageHandler is initialized
    if (!this.messageHandler.initialized) {
      console.log("🎧 Initializing SimpleMessageHandler...");
      this.messageHandler.initialize();
    }
  }

  /**
   * Initialize the background service
   */
  async initialize() {
    if (this.initialized) {
      console.log("🔄 Background service already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing cross-browser background service...");

      // Initialize environment and browser API
      await this.initializebrowserAPI();

      // Initialize NotificationManager
      this.notificationManager = new NotificationManager();
      this.notificationManager.initialize();

      // Initialize translation engine
      await this.initializeTranslationEngine();

      // Register all message handlers with simple handler
      this.registerMessageHandlers();

      // Register Vue message handler
      if (!this.vueMessageHandler) {
        try {
          this.vueMessageHandler = new VueMessageHandler();
          await this.vueMessageHandler.register(this.messageHandler);
          console.log("✅ VueMessageHandler registered successfully");
        } catch (error) {
          console.error("❌ Failed to register VueMessageHandler:", error);
        }
      }

      // Initialize error handlers for specific modules
      await this.initializeErrorHandlers();

      // Refresh context menus
      await this.refreshContextMenus();

      this.initialized = true;

      // Add context menu click listener
      browser.contextMenus.onClicked.addListener.call(
        browser.contextMenus.onClicked,
        async (info, tab) => {
          console.log(
            "[BackgroundService] Context menu item clicked:",
            info.menuItemId,
          );
          switch (info.menuItemId) {
            case "translate-selection":
              // Handle translate selection
              break;
            case "open-options":
              browser.runtime.openOptionsPage();
              break;
            case "translate-screen":
              // Handle translate screen
              break;
            case "open-help":
              browser.tabs.create({
                url: "https://github.com/iSegaro/Translate-It/wiki",
              });
              break;
            case "reload-extension":
              browser.runtime.reload();
              break;
          }
        },
      );

      console.log("✅ Background service initialized successfully");
      console.log("📊 Service info:", this.getDebugInfo());
    } catch (error) {
      console.error("❌ Background service initialization failed:", error);

      // Try to initialize with minimal functionality
      await this.initializeMinimal();

      throw error;
    }
  }

  /**
   * Initialize browser API
   * @private
   */
  async initializebrowserAPI() {
    console.log("🌐 Initializing browser API...");

    this.browser = browser;

    // Make globally available for legacy code
    globalThis.browser = browser;
    globalThis.browser = browser;

    if (typeof self !== "undefined") {
      self.browser = browser;
      self.browser = browser;
    }

    console.log(`✅ browser API initialized with webextension-polyfill`);

    // Initialize settings listener with the browser object
    await initializeSettingsListener(browser);
  }

  /**
   * Initialize translation engine
   * @private
   */
  async initializeTranslationEngine() {
    console.log("🔄 Initializing translation engine...");

    try {
      this.translationEngine = new TranslationEngine();
      await this.translationEngine.initialize();

      console.log("✅ Translation engine initialized");
    } catch (error) {
      console.error("❌ Failed to initialize translation engine:", error);
      throw error;
    }
  }

  /**
   * Initialize and pre-load features
   * @private
   */
  async initializeFeatures() {
    console.log("🚀 Pre-loading essential features...");

    try {
      this.features = await featureLoader.preloadEssentialFeatures();
      console.log("✅ Essential features loaded:", Object.keys(this.features));
    } catch (error) {
      console.error("❌ Failed to load some features:", error);
      // Continue with available features
    }
  }

  /**
   * Initialize error handlers for specific modules
   * @private
   */
  async initializeErrorHandlers() {
    console.log("🛡️ Initializing error handlers...");

    try {
      // Initialize TTS error handlers with proper ErrorHandler
      const { ErrorHandler } = await import(
        "../error-management/ErrorHandler.js"
      );
      const errorHandler = new ErrorHandler();

      // Import TTS handler initializers
      const speakModule = await import("./handlers/tts/handleSpeak.js");
      if (speakModule.initializeTTSHandler) {
        speakModule.initializeTTSHandler(errorHandler);
        console.log("✅ TTS handleSpeak error handler initialized");
      }

      const stopModule = await import("./handlers/tts/handleStopTTS.js");
      if (stopModule.initializeTTSHandler) {
        stopModule.initializeTTSHandler(errorHandler);
        console.log("✅ TTS handleStopTTS error handler initialized");
      }

      const contentModule = await import(
        "./handlers/tts/handleTTSSpeakContent.js"
      );
      if (contentModule.initializeTTSContentHandler) {
        contentModule.initializeTTSContentHandler(errorHandler);
        console.log("✅ TTS handleTTSSpeakContent error handler initialized");
      }

      const offscreenModule = await import(
        "./handlers/tts/handleTTSOffscreen.js"
      );
      if (offscreenModule.initializeTTSOffscreenHandler) {
        offscreenModule.initializeTTSOffscreenHandler(errorHandler);
        console.log("✅ TTS handleTTSOffscreen error handler initialized");
      }

      console.log("✅ Error handlers initialization completed");
    } catch (error) {
      console.error("❌ Failed to initialize error handlers:", error);
      // Continue without error handlers
    }
  }

  /**
   * Initialize with minimal functionality if full initialization fails
   * @private
   */
  async initializeMinimal() {
    console.log("🔧 Attempting minimal initialization...");

    try {
      // At minimum, try to get browser API
      if (!this.browser) {
        this.browser = browser;
        globalThis.browser = this.browser;
        globalThis.browser = this.browser;
      }

      // CRITICAL: Set up MessageRouter first in minimal mode
      try {
        this.registerMessageHandlers();
        console.log("✅ MessageRouter set up in minimal mode");
      } catch (error) {
        console.error(
          "❌ Failed to set up MessageRouter in minimal mode:",
          error,
        );
      }

      // Try to load Vue message handler AFTER messageHandler is initialized
      if (!this.vueMessageHandler && this.messageHandler) {
        try {
          // Import the class
          this.vueMessageHandler = new VueMessageHandler(); // Instantiate the class
          await this.vueMessageHandler.register(this.messageHandler);
        } catch (error) {
          console.error("Vue message handler unavailable in minimal mode");
        }
      }

      // Try to initialize translation engine
      if (!this.translationEngine) {
        try {
          this.translationEngine = new TranslationEngine();
          await this.translationEngine.initialize();
        } catch (error) {
          console.error("Translation engine unavailable in minimal mode");
        }
      }

      console.log("🔧 Minimal initialization completed");
      this.initialized = true;
    } catch (_error) {
      console.error("❌ Even minimal initialization failed:", _error);
      throw _error;
    }
  }

  /**
   * Get debug information
   * @returns {Object}
   */
  getDebugInfo() {
    return {
      initialized: this.initialized,
      browser: browser,
      features: Object.keys(this.features),
      listeners: this.listeners.length,
      hasVueHandler: !!this.vueMessageHandler,
      hasTranslationEngine: !!this.translationEngine,
      translationStats: this.translationEngine
        ? this.translationEngine.getCacheStats()
        : null,
      featureLoader: featureLoader.getDebugInfo(),
    };
  }

  /**
   * Setup port listener to route messages from connected ports
   * @private
   */

  // Register all message handlers with SimpleMessageHandler
  registerMessageHandlers() {
    console.log(
      "[BackgroundService] Registering message handlers with SimpleMessageHandler...",
    );

    // Register custom handlers for legacy actions
    this.messageHandler.registerHandler("ping", Handlers.handlePing);
    this.messageHandler.registerHandler(
      "open_options_page",
      Handlers.handleOpenOptionsPage,
    );
    this.messageHandler.registerHandler("open_url", Handlers.handleOpenURL);
    this.messageHandler.registerHandler(
      "show_os_notification",
      Handlers.handleShowOSNotification,
    );
    this.messageHandler.registerHandler(
      "REFRESH_CONTEXT_MENUS",
      Handlers.handleRefreshContextMenus,
    );
    this.messageHandler.registerHandler(
      "CONTENT_SCRIPT_WILL_RELOAD",
      Handlers.handleContentScriptWillReload,
    );

    // Lifecycle handlers
    this.messageHandler.registerHandler(
      "CONTEXT_INVALID",
      Handlers.handleContextInvalid,
    );
    this.messageHandler.registerHandler(
      "EXTENSION_RELOADED",
      Handlers.handleExtensionReloaded,
    );
    this.messageHandler.registerHandler(
      "restart_content_script",
      Handlers.handleRestartContentScript,
    );
    this.messageHandler.registerHandler(
      "BACKGROUND_RELOAD_EXTENSION",
      Handlers.handleBackgroundReloadExtension,
    );

    // Core translation handler
    this.messageHandler.registerHandler("TRANSLATE", Handlers.handleTranslate);

    // Legacy translation handlers (to maintain compatibility)
    this.messageHandler.registerHandler(
      "fetchTranslation",
      Handlers.handleFetchTranslation,
    );
    this.messageHandler.registerHandler(
      "translationAdded",
      Handlers.handleTranslationAdded,
    );
    this.messageHandler.registerHandler(
      "fetchTranslationBackground",
      Handlers.handleFetchTranslationBackground,
    );
    this.messageHandler.registerHandler(
      "revertTranslation",
      Handlers.handleRevertTranslation,
    );

    // Legacy TTS handlers (to maintain compatibility)
    this.messageHandler.registerHandler("speak", Handlers.handleSpeak);
    this.messageHandler.registerHandler("stopTTS", Handlers.handleStopTTS);
    this.messageHandler.registerHandler(
      "TTS_SPEAK_CONTENT",
      Handlers.handleTTSSpeakContent,
    );
    this.messageHandler.registerHandler(
      "TTS_TEST",
      Handlers.handleTTSOffscreen,
    );
    this.messageHandler.registerHandler(
      "OFFSCREEN_READY",
      Handlers.handleOffscreenReady,
    );
    this.messageHandler.registerHandler(
      "playOffscreenAudio",
      Handlers.handleTTSOffscreen,
    );
    this.messageHandler.registerHandler(
      "stopOffscreenAudio",
      Handlers.handleTTSOffscreen,
    );
    this.messageHandler.registerHandler(
      "playCachedAudio",
      Handlers.handleTTSOffscreen,
    );

    // Element selection handlers
    this.messageHandler.registerHandler(
      "activateSelectElementMode",
      Handlers.handleActivateSelectElementMode,
    );
    this.messageHandler.registerHandler(
      "UPDATE_SELECT_ELEMENT_STATE",
      Handlers.handleUpdateSelectElementState,
    );
    this.messageHandler.registerHandler(
      "elementSelected",
      Handlers.handleElementSelected,
    );
    this.messageHandler.registerHandler(
      "applyTranslationToActiveElement",
      Handlers.handleApplyTranslationToActiveElement,
    );

    // Screen capture handlers
    this.messageHandler.registerHandler(
      "startAreaCapture",
      Handlers.handleStartAreaCapture,
    );
    this.messageHandler.registerHandler(
      "startFullScreenCapture",
      Handlers.handleStartFullScreenCapture,
    );
    this.messageHandler.registerHandler(
      "requestFullScreenCapture",
      Handlers.handleRequestFullScreenCapture,
    );
    this.messageHandler.registerHandler(
      "processAreaCaptureImage",
      Handlers.handleProcessAreaCaptureImage,
    );
    this.messageHandler.registerHandler(
      "previewConfirmed",
      Handlers.handlePreviewConfirmed,
    );
    this.messageHandler.registerHandler(
      "previewCancelled",
      Handlers.handlePreviewCancelled,
    );
    this.messageHandler.registerHandler(
      "previewRetry",
      Handlers.handlePreviewRetry,
    );
    this.messageHandler.registerHandler(
      "resultClosed",
      Handlers.handleResultClosed,
    );
    this.messageHandler.registerHandler(
      "captureError",
      Handlers.handleCaptureError,
    );
    this.messageHandler.registerHandler(
      "areaSelectionCancel",
      Handlers.handleAreaSelectionCancel,
    );

    // Text selection handlers
    this.messageHandler.registerHandler(
      "getSelectedText",
      Handlers.handleGetSelectedText,
    );

    // Page exclusion handlers
    this.messageHandler.registerHandler(
      "isCurrentPageExcluded",
      Handlers.handleIsCurrentPageExcluded,
    );
    this.messageHandler.registerHandler(
      "setExcludeCurrentPage",
      Handlers.handleSetExcludeCurrentPage,
    );

    // Sidepanel handlers
    this.messageHandler.registerHandler(
      "OPEN_SIDE_PANEL",
      Handlers.handleOpenSidePanel,
    );

    console.log(
      "[BackgroundService] All message handlers registered with SimpleMessageHandler successfully.",
    );
  }

  // Note: Helper handlers for GET_PROVIDERS, GET_HISTORY, CLEAR_HISTORY
  // are now built into SimpleMessageHandler

  /**
   * Refresh all context menus
   * @private
   */
  async refreshContextMenus() {
    console.log("🔄 Refreshing context menus...");
    try {
      const { createContextMenu } = await import(
        "../managers/context-menu-manager.js"
      );
      await createContextMenu();
      console.log("✅ Context menus refreshed successfully");
    } catch (error) {
      console.error("❌ Failed to refresh context menus:", error);
    }
  }
  "";

  /**
   * Shutdown the background service (for testing)
   */
  async shutdown() {
    console.log("🛑 Shutting down background service...");

    // Cleanup unified listener manager
    if (this.listenerManager) {
      await this.listenerManager.cleanup();
    }

    // Cleanup core message router
    if (this.coreRouter) {
      this.coreRouter.cleanup();
    }

    // Clear feature loader cache
    featureLoader.clearCache();

    // Reset state
    this.initialized = false;
    this.features = {};
    this.listeners = [];
    this.vueMessageHandler = null;
    this.translationEngine = null;
    this.listenerManager = null;

    console.log("🛑 Background service shutdown complete");
  }

  /**
   * Test update notification (for development)
   */
  async testUpdateNotification(reason = "update") {
    console.log(`[BackgroundService] Manual test trigger: ${reason}`);
    const { triggerTestInstallation } = await import(
      "../handlers/installation-handler.js"
    );
    return await triggerTestInstallation(reason);
  }
}

// Create and initialize background service
const backgroundService = new BackgroundService();

// Make background service and test functions globally accessible after initialization
function exposeGlobalTestFunctions() {
  console.log("[Global] Setting up test functions...");

  const testFn = () => backgroundService.testUpdateNotification("update");
  const installTestFn = (reason = "update") =>
    backgroundService.testUpdateNotification(reason);

  // Try multiple global contexts for maximum compatibility
  try {
    if (typeof self !== "undefined") {
      // Service worker environment
      self.backgroundService = backgroundService;
      self.testUpdateNotification = testFn;
      self.testInstallEvent = installTestFn;
      console.log("[Global] Functions set on self object");
    }
  } catch (e) {
    console.warn("[Global] Failed to set on self:", e);
  }

  try {
    if (typeof window !== "undefined") {
      // Background page environment
      window.backgroundService = backgroundService;
      window.testUpdateNotification = testFn;
      window.testInstallEvent = installTestFn;
      console.log("[Global] Functions set on window object");
    }
  } catch (e) {
    console.warn("[Global] Failed to set on window:", e);
  }

  try {
    // Also try globalThis for compatibility
    globalThis.backgroundService = backgroundService;
    globalThis.testUpdateNotification = testFn;
    globalThis.testInstallEvent = installTestFn;
    console.log("[Global] Functions set on globalThis");
  } catch (e) {
    console.warn("[Global] Failed to set on globalThis:", e);
  }

  // Verify functions are accessible
  try {
    if (typeof testUpdateNotification === "function") {
      console.log("✅ [Global] testUpdateNotification is accessible");
    } else {
      console.warn("❌ [Global] testUpdateNotification is not accessible");
    }
  } catch (e) {
    console.warn("[Global] Function verification failed:", e);
  }
}

// Initialize immediately
backgroundService
  .initialize()
  .then(() => {
    console.log(
      "🎯 Background service initialization completed, setting up test functions...",
    );
    exposeGlobalTestFunctions();
  })
  .catch((_error) => {
    console.error(
      "💥 Critical: Background service initialization failed:",
      _error,
    );

    // Report error to extension pages if possible
    if (typeof chrome !== "undefined" && chrome.runtime) {
      chrome.runtime
        .sendMessage({
          type: "BACKGROUND_INIT_ERROR",
          error: _error.message,
          stack: _error.stack,
        })
        .catch(() => {
          // Ignore if no listeners
        });
    }
  });

// Export for debugging
globalThis.backgroundService = backgroundService;

// Add test functions for development
globalThis.testUpdateNotification = async () => {
  const { triggerTestUpdateNotification } = await import(
    "../handlers/installation-handler.js"
  );
  await triggerTestUpdateNotification();
};

// Handle service worker lifecycle
if (typeof self !== "undefined" && "serviceWorker" in self) {
  self.addEventListener("install", (event) => {
    console.log("🔧 Service worker installing...");
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener("activate", (event) => {
    console.log("🔧 Service worker activating...");
    event.waitUntil(self.clients.claim());
  });

  // Handle unhandled promise rejections
  self.addEventListener("unhandledrejection", (event) => {
    console.error(
      "🚨 Unhandled promise rejection in service worker:",
      event.reason,
    );
  });
}

// Handle uncaught errors
if (typeof self !== "undefined") {
  self.addEventListener("error", (event) => {
    console.error("🚨 Uncaught error in service worker:", event.error);
  });
}

export { backgroundService };
