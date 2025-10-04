import browser from "webextension-polyfill";
import { featureLoader } from "@/core/background/feature-loader.js";

import { initializeSettingsListener } from "@/shared/config/config.js";
import { TranslationEngine } from "@/features/translation/core/translation-engine.js";
import { createMessageHandler } from "@/shared/messaging/core/MessageHandler.js";
import * as Handlers from "@/core/background/handlers/index.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { addBrowserSpecificHandlers } from '@/core/browserHandlers.js';
import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'LifecycleManager');

class LifecycleManager {
  constructor() {
    this.initialized = false;
    this.browser = null;
    this.translationEngine = null;
    this.featureLoader = featureLoader;
    this.messageHandler = createMessageHandler();
    this.dynamicIconManager = null;
    // Note: messageHandler.listen() will be called after handlers are registered
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    // Register message handlers FIRST to prevent race conditions
    this.registerMessageHandlers();

    // Activate message listener AFTER handlers are registered
    if (!this.messageHandler.isListenerActive) {
      this.messageHandler.listen();
    }

    await this.initializebrowserAPI();

    await this.initializeTranslationEngine();

    await this.initializeDynamicIconManager();

    await this.initializeErrorHandlers();

    await this.preloadFeatures();

    await this.refreshContextMenus();

    this.initialized = true;
    logger.info("[LifecycleManager] Background service initialized successfully");
  }

  /**
   * Preload essential features using featureLoader
   * @private
   */
  async preloadFeatures() {
    try {
      logger.info("Preloading essential features...");
      const features = await this.featureLoader.preloadEssentialFeatures();
      logger.info("Essential features preloaded:", Object.keys(features));
    } catch (error) {
      logger.error("❌ Failed to preload essential features:", error);
      // Continue initialization even if preloading fails
    }
  }

  async initializebrowserAPI() {
    this.browser = browser;
    globalThis.browser = browser;
    await initializeSettingsListener(browser);
  }

  async initializeTranslationEngine() {
    try {
      logger.info('[LifecycleManager] Creating TranslationEngine...');
      this.translationEngine = new TranslationEngine();
      logger.info('[LifecycleManager] Initializing TranslationEngine...');
      await this.translationEngine.initialize();
      logger.info('[LifecycleManager] TranslationEngine initialized successfully');
    } catch (error) {
      logger.error('❌ [LifecycleManager] Failed to initialize TranslationEngine:', error);
      throw error;
    }
  }

  async initializeDynamicIconManager() {
    logger.info('Initializing ActionbarIconManager...');
    const { getActionbarIconManager } = await utilsFactory.getBrowserUtils();
    this.dynamicIconManager = await getActionbarIconManager();
    logger.info('ActionbarIconManager initialized');
  }

  registerMessageHandlers() {
    logger.info('Registering message handlers...');
    // Available handlers - logged at TRACE level for detailed debugging
    // logger.trace('Available handlers:', Object.keys(Handlers));
    
    // Hybrid approach: explicit mapping with validation
    const handlerMappings = {
      // Common handlers
      'ping': Handlers.handlePingLazy,
      'openOptionsPage': Handlers.handleOpenOptionsPageLazy,
      'openURL': Handlers.handleOpenURLLazy,
      'showOSNotification': Handlers.handleShowOSNotification,
      'REFRESH_CONTEXT_MENUS': Handlers.handleRefreshContextMenusLazy,
      'contentScriptWillReload': Handlers.handleContentScriptWillReload,
      
      // Lifecycle handlers
      'contextInvalid': Handlers.handleContextInvalid,
      'extensionReloaded': Handlers.handleExtensionReloaded,
      'restartContentScript': Handlers.handleRestartContentScript,
      'backgroundReloadExtension': Handlers.handleBackgroundReloadExtension,
      
      // Translation handlers
      'TRANSLATE': Handlers.handleTranslateLazy,
      'translateText': Handlers.handleTranslateTextLazy,
      'revertTranslation': Handlers.handleRevertTranslationLazy,
      'CANCEL_TRANSLATION': Handlers.handleCancelTranslationLazy,
      'TRANSLATION_RESULT_UPDATE': Handlers.handleTranslationResultLazy,

      // TTS handlers - Lazy loaded for better performance
      'GOOGLE_TTS_SPEAK': Handlers.handleTTSSpeakLazy,
      'TTS_SPEAK': Handlers.handleTTSSpeakLazy,
      'TTS_STOP': Handlers.handleTTSStopLazy,
      'OFFSCREEN_READY': Handlers.handleOffscreenReadyLazy,
      
      // Element selection handlers - Lazy loaded for better performance
      'activateSelectElementMode': Handlers.handleActivateSelectElementModeLazy,
      'deactivateSelectElementMode': Handlers.handleDeactivateSelectElementModeLazy,
      'setSelectElementState': Handlers.handleSetSelectElementStateLazy,
      'getSelectElementState': Handlers.handleGetSelectElementStateLazy,
      'SELECT_ELEMENT_STATE_CHANGED': Handlers.handleSelectElement,
      
      // Screen capture handlers - Lazy loaded for better performance
      'startAreaCapture': Handlers.handleStartAreaCaptureLazy,
      'startFullScreenCapture': Handlers.handleStartFullScreenCaptureLazy,
      'requestFullScreenCapture': Handlers.handleRequestFullScreenCaptureLazy,
      'processAreaCaptureImage': Handlers.handleProcessAreaCaptureImageLazy,
      'previewConfirmed': Handlers.handlePreviewConfirmedLazy,
      'previewCancelled': Handlers.handlePreviewCancelledLazy,
      'previewRetry': Handlers.handlePreviewRetryLazy,
      'resultClosed': Handlers.handleResultClosedLazy,
      'captureError': Handlers.handleCaptureErrorLazy,
      'areaSelectionCancel': Handlers.handleAreaSelectionCancelLazy,
      
      // Text selection handlers
      'getSelectedText': Handlers.handleGetSelectedText,
      
      // Page exclusion handlers
      'isCurrentPageExcluded': Handlers.handleIsCurrentPageExcluded,
      'setExcludeCurrentPage': Handlers.handleSetExcludeCurrentPage,
      
      // Sidepanel handlers
      'openSidePanel': Handlers.handleOpenSidePanel,
      
      // Vue integration handlers - Lazy loaded for better performance
      'translateImage': Handlers.handleTranslateImageLazy,
      'providerStatus': Handlers.handleProviderStatusLazy,
      'testProviderConnection': Handlers.handleTestProviderConnectionLazy,
      'saveProviderConfig': Handlers.handleSaveProviderConfigLazy,
      'getProviderConfig': Handlers.handleGetProviderConfigLazy,
      'startScreenCapture': Handlers.handleStartScreenCaptureLazy,
      'captureScreenArea': Handlers.handleCaptureScreenAreaLazy,
      'updateContextMenu': Handlers.handleUpdateContextMenuLazy,
      'getExtensionInfo': Handlers.handleGetExtensionInfoLazy,
      'logError': Handlers.handleLogErrorLazy,

      // Vue Bridge handlers - Lazy loaded for better performance
      'CREATE_VUE_MICRO_APP': Handlers.handleVueBridgeLazy,
      'DESTROY_VUE_MICRO_APP': Handlers.handleVueBridgeLazy,
      'START_SCREEN_CAPTURE': Handlers.handleVueBridgeLazy,
      'SHOW_CAPTURE_PREVIEW': Handlers.handleVueBridgeLazy
    };
    
    // Add browser-specific handlers
    addBrowserSpecificHandlers();
    
    // Validate handler mappings
    this.validateHandlerMappings(handlerMappings);
    
    // Register all handlers with proper action names
    const { registeredCount, failedCount } = this.performHandlerRegistration(handlerMappings);
    
    logger.info(`Handler registration complete: ${registeredCount} registered, ${failedCount} failed`);
  }

  /**
   * Validate handler mappings to detect unmapped handlers
   * @private
   * @param {Object} handlerMappings - Handler mappings object
   */
  validateHandlerMappings(handlerMappings) {
    const mappedHandlers = new Set(Object.values(handlerMappings));
    const availableHandlers = Object.values(Handlers);
    const unmappedHandlers = availableHandlers.filter(handler => !mappedHandlers.has(handler));
    
    if (unmappedHandlers.length > 0) {
      logger.warn('Unmapped handlers detected (consider adding to handlerMappings):',
                   unmappedHandlers.map(h => h.name || 'anonymous'));
    } else {
      logger.debug('✅ All available handlers are properly mapped');
    }
    
    // Mapping statistics - logged at TRACE level for detailed debugging
    // logger.trace(`Handler mapping validation: ${Object.keys(handlerMappings).length} mapped, ${unmappedHandlers.length} unmapped`);
  }

  /**
   * Perform actual handler registration with error tracking
   * @private
   * @param {Object} handlerMappings - Handler mappings object
   * @returns {Object} Registration results with counts
   */
  performHandlerRegistration(handlerMappings) {
    let registeredCount = 0;
    let failedCount = 0;
    
    for (const [actionName, handlerFunction] of Object.entries(handlerMappings)) {
      if (handlerFunction) {
        try {
          this.messageHandler.registerHandler(actionName, handlerFunction);
          // Handler registered - logged at TRACE level for detailed debugging
          // logger.trace(`Registered handler: ${actionName}`);

          if (actionName === MessageActions.SET_SELECT_ELEMENT_STATE) {
            // Special handler registered - logged at TRACE level for detailed debugging
            // logger.trace('setSelectElementState handler registered', {
            //   actionName,
            //   handlerName: handlerFunction?.name,
            // });
          }
          
          registeredCount++;
        } catch (error) {
          logger.error(`❌ Failed to register handler for action: ${actionName}`, error);
          failedCount++;
        }
      } else {
        logger.warn(`⚠️ Handler function not found for action: ${actionName}`);
        failedCount++;
      }
    }
    
    return { registeredCount, failedCount };
  }

  /**
   * Initialize error handlers for specific modules
   * @private
   */
  async initializeErrorHandlers() {
    logger.info("Initializing error handlers...");

    try {
      const { ErrorHandler } = await import(
        "@/shared/error-management/ErrorHandler.js"
      );
      new ErrorHandler();

      // TTS error handling now integrated into handleGoogleTTS directly

      logger.info("Error handlers initialization completed");
    } catch (error) {
      logger.error("❌ Failed to initialize error handlers:", error);
    }
  }

  async refreshContextMenus(locale) {
    logger.info("[LifecycleManager] Starting context menu refresh...");

    try {
      logger.info("[LifecycleManager] Loading context menu manager via featureLoader...");
      this.contextMenuManager = await this.featureLoader.loadContextMenuManager();
      logger.info("[LifecycleManager] Context menu manager loaded successfully");

      logger.info("[LifecycleManager] Refreshing context menus...");
      await this.contextMenuManager.initialize(true, locale); // Force re-initialize with locale
      logger.info("[LifecycleManager] Context menus refreshed successfully via featureLoader");

    } catch (error) {
      logger.error("❌ [LifecycleManager] Failed to refresh context menus via featureLoader:", error);
      logger.info("[LifecycleManager] Attempting fallback initialization...");

      try {
        // Fallback to direct import of new context menu manager
        const { ContextMenuManager } = await import("@/core/managers/context-menu.js");

        // Check if we already have an instance to reuse
        if (!this.contextMenuManager) {
          this.contextMenuManager = new ContextMenuManager();
        }

        logger.info("[LifecycleManager] Initializing context menus via fallback...");
        await this.contextMenuManager.initialize(true, locale); // Force re-initialize with locale
        logger.info("[LifecycleManager] Context menus refreshed successfully via fallback");

      } catch (fallbackError) {
        logger.error("❌ [LifecycleManager] Fallback context menu initialization also failed:", fallbackError);
        // Try one more direct approach
        await this.createContextMenuDirectly();
      }
    }
  }

  /**
   * Direct context menu creation as ultimate fallback
   */
  async createContextMenuDirectly() {
    try {
      logger.info("[LifecycleManager] Attempting direct context menu creation...");

      const browser = await import("webextension-polyfill");

      // Clear existing menus
      await browser.contextMenus.removeAll();

      // Create basic action menu
      await browser.contextMenus.create({
        id: "action-translate-element-direct",
        title: "Translate Element (Direct)",
        contexts: ["action"]
      });

      // Create options menu
      await browser.contextMenus.create({
        id: "open-options-page-direct",
        title: "Options (Direct)",
        contexts: ["action"]
      });

      logger.info("[LifecycleManager] Direct context menu creation completed");

    } catch (directError) {
      logger.error("❌ [LifecycleManager] Direct context menu creation failed:", directError);
    }
  }

  cleanup() {
    this.initialized = false;
    this.browser = null;
    this.translationEngine = null;
    
    logger.debug('LifecycleManager cleanup completed');
  }
}

export { LifecycleManager };