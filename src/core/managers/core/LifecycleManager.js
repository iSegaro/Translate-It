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

    // Initialize TTS voice cache in background
    this.initializeTTSVoiceCache();

    this.initialized = true;
    logger.info("[LifecycleManager] Background service initialized successfully");
  }

  /**
   * Initialize TTS voice list cache in background
   * @private
   */
  async initializeTTSVoiceCache() {
    try {
      // Lazy load to keep startup light
      const { ttsVoiceService } = await import("@/features/tts/services/TTSVoiceService.js");
      // This will trigger a fetch only if the 24h cache is expired
      ttsVoiceService.getVoices();
      logger.debug("[LifecycleManager] TTS Voice cache initialization triggered");
    } catch (e) {
      logger.debug("[LifecycleManager] TTS Voice cache initialization skipped:", e.message);
    }
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
      logger.error("Failed to preload essential features:", error);
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
      logger.error('[LifecycleManager] Failed to initialize TranslationEngine:', error);
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
      [MessageActions.OPEN_OPTIONS_PAGE]: Handlers.handleOpenOptionsPageLazy,
      'openURL': Handlers.handleOpenURLLazy,
      'showOSNotification': Handlers.handleShowOSNotification,
      'REFRESH_CONTEXT_MENUS': Handlers.handleRefreshContextMenusLazy,
      'contentScriptWillReload': Handlers.handleContentScriptWillReload,
      [MessageActions.SETTINGS_UPDATED]: Handlers.handleSettingsUpdatedLazy,
      
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
      [MessageActions.CANCEL_SESSION]: Handlers.handleCancelSessionLazy,
      [MessageActions.TRANSLATION_RESULT_UPDATE]: Handlers.handleTranslationResultLazy,
      'CHECK_TRANSLATION_STATUS': Handlers.handleCheckTranslationStatusLazy,

      // TTS handlers - Lazy loaded for better performance
      [MessageActions.GOOGLE_TTS_SPEAK]: Handlers.handleTTSSpeakLazy,
      'TTS_SPEAK': Handlers.handleTTSSpeakLazy,
      [MessageActions.TTS_STOP]: Handlers.handleTTSStopLazy,
      [MessageActions.GOOGLE_TTS_ENDED]: Handlers.handleTTSEndedLazy,
      [MessageActions.OFFSCREEN_READY]: Handlers.handleOffscreenReadyLazy,
      'clearTTSHandlerCache': Handlers.clearTTSHandlerCache,
      'getTTSHandlerStats': Handlers.getTTSHandlerStats,
      
      // Element selection handlers - Lazy loaded for better performance
      'activateSelectElementMode': Handlers.handleActivateSelectElementModeLazy,
      'deactivateSelectElementMode': Handlers.handleDeactivateSelectElementModeLazy,
      'setSelectElementState': Handlers.handleSetSelectElementStateLazy,
      'getSelectElementState': Handlers.handleGetSelectElementStateLazy,
      'SELECT_ELEMENT_STATE_CHANGED': Handlers.handleSelectElement,
      'clearElementSelectionHandlerCache': Handlers.clearElementSelectionHandlerCache,
      'getElementSelectionHandlerStats': Handlers.getElementSelectionHandlerStats,
      
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

      // Page translation handlers
      [MessageActions.PAGE_TRANSLATE]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_BATCH]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_RESTORE]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_GET_STATUS]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_START]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_PROGRESS]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_COMPLETE]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_ERROR]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_RESET_ERROR]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_RESTORE_COMPLETE]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_AUTO_RESTORE_COMPLETE]: Handlers.handlePageTranslation, // NEW
      [MessageActions.PAGE_RESTORE_ERROR]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_CANCELLED]: Handlers.handlePageTranslation,
      [MessageActions.PAGE_TRANSLATE_STOP_AUTO]: Handlers.handlePageTranslation, // NEW

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
    
    // Register DebugModeBridge handlers
    try {
      import('@/shared/logging/DebugModeBridge.js').then(({ debugModeBridge }) => {
        const debugHandlers = debugModeBridge.getHandlerMappings();
        for (const [action, handler] of Object.entries(debugHandlers)) {
          this.messageHandler.registerHandler(action, handler);
        }
        logger.info('Registered DebugModeBridge handlers in background');
      }).catch(err => {
        logger.warn('Failed to load DebugModeBridge for handler registration:', err);
      });
    } catch (error) {
      logger.warn('Error during DebugModeBridge registration:', error);
    }
    
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
      logger.debug('All available handlers are properly mapped');
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
          logger.error(`Failed to register handler for action: ${actionName}`, error);
          failedCount++;
        }
      } else {
        logger.warn(`Handler function not found for action: ${actionName}`);
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
      logger.error("Failed to initialize error handlers:", error);
    }
  }

  async refreshContextMenus(locale) {
    logger.info("[LifecycleManager] Starting context menu refresh...");

    try {
      // Use featureLoader to get the singleton manager
      this.contextMenuManager = await this.featureLoader.loadContextMenuManager();
      
      // Only call initialize(true) if we need to force a refresh (e.g. locale change)
      // loadContextMenuManager already calls initialize() once
      if (locale) {
        logger.info("[LifecycleManager] Re-initializing context menus with locale:", locale);
        await this.contextMenuManager.initialize(true, locale);
      } else {
        // If no locale specified, ensuring it's at least initialized
        // Note: loadContextMenuManager already initialized it, so this might be redundant
        // but safe due to ContextMenuManager's internal checks.
        // To be even safer against duplicates, we only initialize if NOT already initialized
        if (!this.contextMenuManager.initialized) {
           await this.contextMenuManager.initialize();
        }
      }
      
      logger.info("[LifecycleManager] Context menus refreshed successfully");

    } catch (error) {
      logger.error("[LifecycleManager] Failed to refresh context menus:", error);
      // Try one more direct approach as ultimate fallback if featureLoader failed
      await this.createContextMenuDirectly();
    }
  }

  /**
   * Direct context menu creation as ultimate fallback
   * NOTE: This method is now deprecated. ContextMenuManager should be the sole authority.
   * This is kept only as emergency fallback and will not create duplicate menus.
   */
  async createContextMenuDirectly() {
    try {
      logger.info("[LifecycleManager] ContextMenuManager failed, checking if menus exist...");

      const browser = await import("webextension-polyfill");

      // Check if any menus already exist before doing anything
      try {
        const existingMenus = await browser.contextMenus.getAll();
        if (existingMenus && existingMenus.length > 0) {
          logger.info("[LifecycleManager] Context menus already exist, skipping creation to avoid duplicates");
          return;
        }
      } catch {
        logger.debug("[LifecycleManager] Could not check existing menus, proceeding with caution");
      }

      logger.warn("[LifecycleManager] Creating minimal fallback menus only if absolutely necessary...");

      // Create minimal fallback menus with unique IDs that won't conflict
      try {
        await browser.contextMenus.create({
          id: "lifecycle-emergency-translate",
          title: "Translate (Emergency)",
          contexts: ["action"]
        });
      } catch (createError) {
        logger.error("[LifecycleManager] Even emergency menu creation failed:", createError);
      }

      logger.info("[LifecycleManager] Emergency context menu setup completed");

    } catch (directError) {
      logger.error("[LifecycleManager] Emergency context menu creation failed:", directError);
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