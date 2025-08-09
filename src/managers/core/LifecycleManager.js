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
    if (this.initialized) {
      return;
    }
    
    await this.initializebrowserAPI();
    
    this.notificationManager = new NotificationManager();
    this.notificationManager.initialize();

    await this.initializeTranslationEngine();

    this.registerMessageHandlers();

    await this.initializeErrorHandlers();

    await this.preloadFeatures();

    await this.refreshContextMenus();
    
    this.initialized = true;
    console.log("✅ [LifecycleManager] Background service initialized successfully");
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
    console.log('🎯 Registering message handlers...');
    console.log('Available handlers:', Object.keys(Handlers));
    
    // Manual registration for all needed actions to ensure correct mapping
    const handlerMappings = {
      // Common handlers
      'ping': Handlers.handlePing,
      'openOptionsPage': Handlers.handleOpenOptionsPage,
      'openURL': Handlers.handleOpenURL,
      'showOSNotification': Handlers.handleShowOSNotification,
      'refreshContextMenus': Handlers.handleRefreshContextMenus,
      'contentScriptWillReload': Handlers.handleContentScriptWillReload,
      
      // Lifecycle handlers
      'contextInvalid': Handlers.handleContextInvalid,
      'extensionReloaded': Handlers.handleExtensionReloaded,
      'restartContentScript': Handlers.handleRestartContentScript,
      'backgroundReloadExtension': Handlers.handleBackgroundReloadExtension,
      
      // Translation handlers
      'TRANSLATE': Handlers.handleTranslate,
      'translateText': Handlers.handleTranslateText,
      'revertTranslation': Handlers.handleRevertTranslation,
      
      // TTS handlers
      'TTS_SPEAK': Handlers.handleSpeak,
      
      // Element selection handlers
      'activateSelectElementMode': Handlers.handleActivateSelectElementMode,
      'deactivateSelectElementMode': Handlers.handleActivateSelectElementMode,
      'setSelectElementState': Handlers.handleSetSelectElementState,
      'getSelectElementState': Handlers.handleGetSelectElementState,
      
      // Screen capture handlers
      'startAreaCapture': Handlers.handleStartAreaCapture,
      'startFullScreenCapture': Handlers.handleStartFullScreenCapture,
      'requestFullScreenCapture': Handlers.handleRequestFullScreenCapture,
      'processAreaCaptureImage': Handlers.handleProcessAreaCaptureImage,
      'previewConfirmed': Handlers.handlePreviewConfirmed,
      'previewCancelled': Handlers.handlePreviewCancelled,
      'previewRetry': Handlers.handlePreviewRetry,
      'resultClosed': Handlers.handleResultClosed,
      'captureError': Handlers.handleCaptureError,
      'areaSelectionCancel': Handlers.handleAreaSelectionCancel,
      
      // Text selection handlers
      'getSelectedText': Handlers.handleGetSelectedText,
      
      // Page exclusion handlers
      'isCurrentPageExcluded': Handlers.handleIsCurrentPageExcluded,
      'setExcludeCurrentPage': Handlers.handleSetExcludeCurrentPage,
      
      // Sidepanel handlers
      'openSidePanel': Handlers.handleOpenSidePanel,
      
      // Vue integration handlers
      'translateImage': Handlers.handleTranslateImage,
      'providerStatus': Handlers.handleProviderStatus,
      'testProviderConnection': Handlers.handleTestProviderConnection,
      'saveProviderConfig': Handlers.handleSaveProviderConfig,
      'getProviderConfig': Handlers.handleGetProviderConfig,
      'startScreenCapture': Handlers.handleStartScreenCapture,
      'captureScreenArea': Handlers.handleCaptureScreenArea,
      'updateContextMenu': Handlers.handleUpdateContextMenu,
      'getExtensionInfo': Handlers.handleGetExtensionInfo,
      'logError': Handlers.handleLogError
    };
    
    // Register all handlers with proper action names
    for (const [actionName, handlerFunction] of Object.entries(handlerMappings)) {
      if (handlerFunction) {
        this.messageHandler.registerHandler(actionName, handlerFunction);
        console.log(`✅ Registered handler: ${actionName}`);
      } else {
        console.warn(`⚠️ Handler function not found for action: ${actionName}`);
      }
    }
    
    console.log('📊 Handler registration stats:', this.messageHandler.getStats());
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
