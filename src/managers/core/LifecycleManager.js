import browser from "webextension-polyfill";
import { featureLoader } from "../../background/feature-loader.js";
import NotificationManager from "./NotificationManager.js"; // Updated path
import { initializeSettingsListener } from "../../config.js";
import { TranslationEngine } from "../../background/translation-engine.js";
import { simpleMessageHandler } from "../../core/SimpleMessageHandler.js"; // This might need to be moved later
import * as Handlers from "../../background/handlers/index.js"; // This might need to be moved later

class LifecycleManager {
  constructor() {
    this.initialized = false;
    this.browser = null;
    this.translationEngine = null;
    this.featureLoader = featureLoader;
    this.messageHandler = simpleMessageHandler;
    if (!this.messageHandler.initialized) {
      this.messageHandler.initialize();
    }
  }

  async initialize() {
    if (this.initialized) return;
    await this.initializebrowserAPI();
    this.notificationManager = new NotificationManager();
    this.notificationManager.initialize();
    await this.initializeTranslationEngine();
    this.registerMessageHandlers();
    await this.initializeErrorHandlers();
    await this.preloadFeatures();
    await this.refreshContextMenus();
    this.initialized = true;
    console.log("✅ Background service initialized successfully");
  }

  /**
   * Preload essential features using featureLoader
   * @private
   */
  async preloadFeatures() {
    try {
      console.log("🚀 Preloading essential features...");
      const features = await this.featureLoader.preloadEssentialFeatures();
      console.log("✅ Essential features preloaded:", Object.keys(features));
    } catch (error) {
      console.error("❌ Failed to preload essential features:", error);
      // Continue initialization even if preloading fails
    }
  }

  async initializebrowserAPI() {
    this.browser = browser;
    globalThis.browser = browser;
    await initializeSettingsListener(browser);
  }

  async initializeTranslationEngine() {
    this.translationEngine = new TranslationEngine();
    await this.translationEngine.initialize();
  }

  registerMessageHandlers() {
    for (const handlerName in Handlers) {
      if (Object.hasOwnProperty.call(Handlers, handlerName)) {
        const actionName = handlerName.replace('handle', '').charAt(0).toLowerCase() + handlerName.slice(7);
        this.messageHandler.registerHandler(actionName, Handlers[handlerName]);
      }
    }
    
    // Manual registration for case-sensitive actions
    this.messageHandler.registerHandler('TRANSLATE', Handlers.handleTranslate);
    this.messageHandler.registerHandler('TTS_SPEAK', Handlers.handleSpeak);
  }

  /**
   * Initialize error handlers for specific modules
   * @private
   */
  async initializeErrorHandlers() {
    console.log("🛡️ Initializing error handlers...");

    try {
      const { ErrorHandler } = await import(
        "../../error-management/ErrorHandler.js"
      );
      const errorHandler = new ErrorHandler();

      const speakModule = await import("../../background/handlers/tts/handleSpeak.js");
      if (speakModule.initializeSpeakHandler) {
        speakModule.initializeSpeakHandler(errorHandler);
        console.log("✅ TTS handleSpeak error handler initialized");
      }

      const stopModule = await import("../../background/handlers/tts/handleStopSpeak.js");
      if (stopModule.initializeStopTTSHandler) {
        stopModule.initializeStopTTSHandler(errorHandler);
        console.log("✅ TTS handleStopTTS error handler initialized");
      }

      console.log("✅ Error handlers initialization completed");
    } catch (error) {
      console.error("❌ Failed to initialize error handlers:", error);
    }
  }

  async refreshContextMenus() {
    try {
      const contextMenuManager = await this.featureLoader.loadContextMenuManager();
      await contextMenuManager.setupDefaultMenus();
    } catch (error) {
      console.error("❌ Failed to refresh context menus via featureLoader:", error);
      // Fallback to direct import
      const { createContextMenu } = await import("../../managers/context-menu-manager.js"); // This might need to be moved later
      await createContextMenu();
    }
  }
}

export { LifecycleManager };
