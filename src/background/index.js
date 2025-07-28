// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import browser from "webextension-polyfill";
import { featureLoader } from "./feature-loader.js";
import { VueMessageHandler } from "./vue-message-handler.js";
import NotificationManager from "../managers/NotificationManager.js";
import { initializeSettingsListener } from "../config.js";
import { TranslationEngine } from "./translation-engine.js";
import { coreMessageRouter } from "../core/CoreMessageRouter.js";
import { UnifiedListenerManager } from "../core/UnifiedListenerManager.js";
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
    this.coreRouter = coreMessageRouter;
    this.listenerManager = new UnifiedListenerManager(coreMessageRouter);
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

      // Load Vue message handler
      await this.initializeVueMessageHandler();

      // Initialize translation engine
      await this.initializeTranslationEngine();

      // Initialize core message router
      await this.coreRouter.initialize();

      // Initialize unified listener manager
      await this.listenerManager.initialize();

      // Pre-load essential features
      await this.initializeFeatures();

      // Register all message handlers with core router
      this.registerMessageHandlers();

      // Initialize error handlers for specific modules
      await this.initializeErrorHandlers();

      // Refresh context menus
      await this.refreshContextMenus();

      this.initialized = true;

      // Add context menu click listener
      browser.contextMenus.onClicked.addListener(async (info, tab) => {
        console.log('[BackgroundService] Context menu item clicked:', info.menuItemId);
        switch (info.menuItemId) {
          case 'translate-selection':
            // Handle translate selection
            break;
          case 'open-options':
            browser.runtime.openOptionsPage();
            break;
          case 'translate-screen':
            // Handle translate screen
            break;
          case 'open-help':
            browser.tabs.create({ url: 'https://github.com/iSegaro/Translate-It/wiki' });
            break;
          case 'reload-extension':
            browser.runtime.reload();
            break;
        }
      });

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
   * Initialize Vue message handler
   * @private
   */
  async initializeVueMessageHandler() {
    console.log("📡 Initializing Vue message handler...");

    try {
      this.vueMessageHandler = new VueMessageHandler();
      await this.vueMessageHandler.register();

      console.log("✅ Vue message handler registered");
    } catch (error) {
      console.error("❌ Failed to initialize Vue message handler:", error);
      throw error;
    }
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

      // Try to load Vue message handler
      if (!this.vueMessageHandler) {
        try {
          // Import the class
          this.vueMessageHandler = new VueMessageHandler(); // Instantiate the class
          await this.vueMessageHandler.register();
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

      // CRITICAL: Set up MessageRouter even in minimal mode
      try {
        this.registerMessageHandlers();
        await this.setupCentralMessageListener();
        console.log("✅ MessageRouter set up in minimal mode");
      } catch (error) {
        console.error(
          "❌ Failed to set up MessageRouter in minimal mode:",
          error
        );
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
      translationStats:
        this.translationEngine ? this.translationEngine.getCacheStats() : null,
      featureLoader: featureLoader.getDebugInfo(),
    };
  }

  /**
   * Setup port listener to route messages from connected ports
   * @private
   */

  // Register all message handlers with CoreMessageRouter
  registerMessageHandlers() {
    console.log(
      "[BackgroundService] Registering message handlers with CoreMessageRouter..."
    );

    // Common handlers
    this.coreRouter.registerHandler("ping", Handlers.handlePing);
    this.coreRouter.registerHandler(
      "open_options_page",
      Handlers.handleOpenOptionsPage
    );
    this.coreRouter.registerHandler("open_url", Handlers.handleOpenURL);
    this.coreRouter.registerHandler(
      "show_os_notification",
      Handlers.handleShowOSNotification
    );
    this.coreRouter.registerHandler(
      "REFRESH_CONTEXT_MENUS",
      Handlers.handleRefreshContextMenus
    );
    this.coreRouter.registerHandler(
      "CONTENT_SCRIPT_WILL_RELOAD",
      Handlers.handleContentScriptWillReload
    );

    // Lifecycle handlers
    this.coreRouter.registerHandler(
      "CONTEXT_INVALID",
      Handlers.handleContextInvalid
    );
    this.coreRouter.registerHandler(
      "EXTENSION_RELOADED",
      Handlers.handleExtensionReloaded
    );
    this.coreRouter.registerHandler(
      "restart_content_script",
      Handlers.handleRestartContentScript
    );
    this.coreRouter.registerHandler(
      "BACKGROUND_RELOAD_EXTENSION",
      Handlers.handleBackgroundReloadExtension
    );

    // Translation handlers (require port for better reliability)
    this.coreRouter.registerHandler("TRANSLATE", Handlers.handleTranslate, {
      requiresPort: true,
      contexts: ["popup", "sidepanel", "content"],
      timeout: 60000,
    });
    this.coreRouter.registerHandler(
      "fetchTranslation",
      Handlers.handleFetchTranslation
    );
    this.coreRouter.registerHandler(
      "translationAdded",
      Handlers.handleTranslationAdded
    );
    this.coreRouter.registerHandler(
      "fetchTranslationBackground",
      Handlers.handleFetchTranslationBackground
    );
    this.coreRouter.registerHandler(
      "revertTranslation",
      Handlers.handleRevertTranslation
    );

    // Provider and settings handlers
    this.coreRouter.registerHandler(
      "GET_PROVIDERS",
      this.handleGetProviders.bind(this)
    );
    this.coreRouter.registerHandler(
      "GET_HISTORY",
      this.handleGetHistory.bind(this)
    );
    this.coreRouter.registerHandler(
      "CLEAR_HISTORY",
      this.handleClearHistory.bind(this)
    );

    // TTS handlers
    this.coreRouter.registerHandler("speak", Handlers.handleSpeak);
    this.coreRouter.registerHandler("stopTTS", Handlers.handleStopTTS);
    this.coreRouter.registerHandler(
      "TTS_SPEAK_CONTENT",
      Handlers.handleTTSSpeakContent
    );
    this.coreRouter.registerHandler("TTS_SPEAK", Handlers.handleTTSOffscreen);
    this.coreRouter.registerHandler("TTS_STOP", Handlers.handleTTSOffscreen);
    this.coreRouter.registerHandler("TTS_TEST", Handlers.handleTTSOffscreen);
    this.coreRouter.registerHandler(
      "OFFSCREEN_READY",
      Handlers.handleOffscreenReady
    );
    this.coreRouter.registerHandler(
      "playOffscreenAudio",
      Handlers.handleTTSOffscreen
    );
    this.coreRouter.registerHandler(
      "stopOffscreenAudio",
      Handlers.handleTTSOffscreen
    );
    this.coreRouter.registerHandler(
      "playCachedAudio",
      Handlers.handleTTSOffscreen
    );

    // Element selection handlers
    this.coreRouter.registerHandler(
      "activateSelectElementMode",
      Handlers.handleActivateSelectElementMode
    );
    this.coreRouter.registerHandler(
      "UPDATE_SELECT_ELEMENT_STATE",
      Handlers.handleUpdateSelectElementState
    );
    this.coreRouter.registerHandler(
      "elementSelected",
      Handlers.handleElementSelected
    );
    this.coreRouter.registerHandler(
      "applyTranslationToActiveElement",
      Handlers.handleApplyTranslationToActiveElement
    );

    // Screen capture handlers
    this.coreRouter.registerHandler(
      "startAreaCapture",
      Handlers.handleStartAreaCapture
    );
    this.coreRouter.registerHandler(
      "startFullScreenCapture",
      Handlers.handleStartFullScreenCapture
    );
    this.coreRouter.registerHandler(
      "requestFullScreenCapture",
      Handlers.handleRequestFullScreenCapture
    );
    this.coreRouter.registerHandler(
      "processAreaCaptureImage",
      Handlers.handleProcessAreaCaptureImage
    );
    this.coreRouter.registerHandler(
      "previewConfirmed",
      Handlers.handlePreviewConfirmed
    );
    this.coreRouter.registerHandler(
      "previewCancelled",
      Handlers.handlePreviewCancelled
    );
    this.coreRouter.registerHandler(
      "previewRetry",
      Handlers.handlePreviewRetry
    );
    this.coreRouter.registerHandler(
      "resultClosed",
      Handlers.handleResultClosed
    );
    this.coreRouter.registerHandler(
      "captureError",
      Handlers.handleCaptureError
    );
    this.coreRouter.registerHandler(
      "areaSelectionCancel",
      Handlers.handleAreaSelectionCancel
    );

    // Text selection handlers
    this.coreRouter.registerHandler(
      "getSelectedText",
      Handlers.handleGetSelectedText
    );

    // Page exclusion handlers
    this.coreRouter.registerHandler(
      "isCurrentPageExcluded",
      Handlers.handleIsCurrentPageExcluded
    );
    this.coreRouter.registerHandler(
      "setExcludeCurrentPage",
      Handlers.handleSetExcludeCurrentPage
    );

    // Sidepanel handlers
    this.coreRouter.registerHandler(
      "OPEN_SIDE_PANEL",
      Handlers.handleOpenSidePanel
    );

    console.log(
      "[BackgroundService] All message handlers registered with CoreMessageRouter successfully."
    );
  }

  // Helper handlers for new client methods
  async handleGetProviders(message, sender) {
    const { getAvailableProviders } = await import("../providers/index.js");
    return { providers: getAvailableProviders() };
  }

  async handleGetHistory(message, sender) {
    const { getTranslationHistory } = await import("../config.js");
    return { history: await getTranslationHistory() };
  }

  async handleClearHistory(message, sender) {
    const { clearTranslationHistory } = await import("../config.js");
    await clearTranslationHistory();
    return { success: true };
  }

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
      "🎯 Background service initialization completed, setting up test functions..."
    );
    exposeGlobalTestFunctions();

    // Add onInstalled listener
    browser.runtime.onInstalled.addListener(async (details) => {
      console.log('[BackgroundService] runtime.onInstalled event triggered:', details.reason);
      const { handleInstallationEvent } = await import('../handlers/installation-handler.js');
      await handleInstallationEvent(details);
    });

    // Add notifications.onClicked listener
    browser.notifications.onClicked.addListener(async (notificationId) => {
      console.log('[BackgroundService] notifications.onClicked event triggered:', notificationId);
      const { handleNotificationEvent } = await import('../handlers/notification-handler.js');
      await handleNotificationEvent(notificationId);
    });
  })
  .catch((_error) => {
    console.error(
      "💥 Critical: Background service initialization failed:",
      _error
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
      event.reason
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
