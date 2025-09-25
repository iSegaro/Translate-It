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
    logger.debug("✅ [LifecycleManager] Background service initialized successfully");
  }

  /**
   * Preload essential features using featureLoader
   * @private
   */
  async preloadFeatures() {
    try {
      logger.debug("🚀 Preloading essential features...");
      const features = await this.featureLoader.preloadEssentialFeatures();
      logger.debug("✅ Essential features preloaded:", Object.keys(features));
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
    this.translationEngine = new TranslationEngine();
    await this.translationEngine.initialize();
  }

  async initializeDynamicIconManager() {
    logger.debug('Initializing ActionbarIconManager...');
    const { getActionbarIconManager } = await import('@/utils/browser/ActionbarIconManager.js');
    this.dynamicIconManager = await getActionbarIconManager();
    logger.debug('ActionbarIconManager initialized');
  }

  registerMessageHandlers() {
    logger.debug('🎯 Registering message handlers...');
    logger.debug('Available handlers:', Object.keys(Handlers));
    
    // Hybrid approach: explicit mapping with validation
    const handlerMappings = {
      // Common handlers
      'ping': Handlers.handlePing,
      'openOptionsPage': Handlers.handleOpenOptionsPage,
      'openURL': Handlers.handleOpenURL,
      'showOSNotification': Handlers.handleShowOSNotification,
      'REFRESH_CONTEXT_MENUS': Handlers.handleRefreshContextMenus,
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
      'CANCEL_TRANSLATION': Handlers.handleCancelTranslation,
      'TRANSLATION_RESULT_UPDATE': Handlers.handleTranslationResult,

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
    addBrowserSpecificHandlers(handlerMappings, Handlers);
    
    // Validate handler mappings
    this.validateHandlerMappings(handlerMappings);
    
    // Register all handlers with proper action names
    const { registeredCount, failedCount } = this.performHandlerRegistration(handlerMappings);
    
    logger.debug(`📊 Handler registration complete: ${registeredCount} registered, ${failedCount} failed`);
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
      logger.warn('⚠️ Unmapped handlers detected (consider adding to handlerMappings):', 
                   unmappedHandlers.map(h => h.name || 'anonymous'));
    } else {
      logger.debug('✅ All available handlers are properly mapped');
    }
    
    // Log mapping statistics
    logger.debug(`📊 Handler mapping validation: ${Object.keys(handlerMappings).length} mapped, ${unmappedHandlers.length} unmapped`);
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
          logger.debug(`✅ Registered handler: ${actionName}`);
          
          if (actionName === MessageActions.SET_SELECT_ELEMENT_STATE) {
            logger.debug('setSelectElementState handler registered', {
              actionName,
              handlerName: handlerFunction?.name,
            });
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
    logger.debug("🛡️ Initializing error handlers...");

    try {
      const { ErrorHandler } = await import(
        "@/shared/error-management/ErrorHandler.js"
      );
      new ErrorHandler();

      // TTS error handling now integrated into handleGoogleTTS directly

      logger.debug("✅ Error handlers initialization completed");
    } catch (error) {
      logger.error("❌ Failed to initialize error handlers:", error);
    }
  }

  async refreshContextMenus(locale) {
    try {
      const contextMenuManager = await this.featureLoader.loadContextMenuManager();
      await contextMenuManager.initialize(true, locale); // Force re-initialize with locale
    } catch (error) {
      logger.error("❌ Failed to refresh context menus via featureLoader:", error);
      // Fallback to direct import of new context menu manager
      const { ContextMenuManager } = await import("@/core/managers/context-menu.js");
      const contextMenuManager = new ContextMenuManager();
      await contextMenuManager.initialize(true, locale); // Force re-initialize with locale
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