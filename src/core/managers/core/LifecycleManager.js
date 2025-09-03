import browser from "webextension-polyfill";
import { featureLoader } from "@/core/background/feature-loader.js";

import { initializeSettingsListener } from "@/shared/config/config.js";
import { TranslationEngine } from "@/features/translation/core/translation-engine.js";
import {
  handleGoogleTTSSpeak,
  handleGoogleTTSStopAll,
  handleGoogleTTSPause,
  handleGoogleTTSResume,
  handleGoogleTTSGetStatus,
} from '@/features/tts/handlers/handleGoogleTTS.js';
import { simpleMessageHandler } from "@/core/SimpleMessageHandler.js"; // This might need to be moved later
import * as Handlers from "@/core/background/handlers/index.js"; // This might need to be moved later
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { addBrowserSpecificHandlers } from '@/core/browserHandlers.js';
import { actionbarIconManager } from '@/utils/browser/ActionbarIconManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'LifecycleManager');

class LifecycleManager {
  constructor() {
    this.initialized = false;
    this.browser = null;
    this.translationEngine = null;
    this.featureLoader = featureLoader;
    this.messageHandler = simpleMessageHandler;
    this.dynamicIconManager = actionbarIconManager;
    if (!this.messageHandler.initialized) {
      this.messageHandler.initialize();
    }
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    
    await this.initializebrowserAPI();

    await this.initializeTranslationEngine();

    await this.initializeDynamicIconManager();

    this.registerMessageHandlers();

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
    await this.dynamicIconManager.initialize();
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
      
      // Subtitle handlers
      'subtitleTranslate': Handlers.handleSubtitleTranslate,
      'subtitleToggle': Handlers.handleSubtitleToggle,
      'subtitleStatus': Handlers.handleSubtitleStatus,
      
      // TTS handlers
      'GOOGLE_TTS_SPEAK': handleGoogleTTSSpeak,
      'GOOGLE_TTS_STOP_ALL': handleGoogleTTSStopAll,
      'GOOGLE_TTS_PAUSE': handleGoogleTTSPause,
      'GOOGLE_TTS_RESUME': handleGoogleTTSResume,
      'GOOGLE_TTS_GET_STATUS': handleGoogleTTSGetStatus,
      
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
    
    // Add browser-specific handlers
    addBrowserSpecificHandlers(handlerMappings, Handlers);
    
    // Validate handler mappings
    this.validateHandlerMappings(handlerMappings);
    
    // Register all handlers with proper action names
    const { registeredCount, failedCount } = this.performHandlerRegistration(handlerMappings);
    
    logger.debug(`📊 Handler registration complete: ${registeredCount} registered, ${failedCount} failed`);
    logger.debug('📊 Handler registration stats:', this.messageHandler.getStats());
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
}

export { LifecycleManager };