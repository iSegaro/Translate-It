// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { environment } from '../utils/environment.js';
import { getBrowserAPI } from '../utils/browser-unified.js';
import { featureLoader } from './feature-loader.js';
import { VueMessageHandler } from './vue-message-handler.js';
import NotificationManager from '../managers/NotificationManager.js';
import { initializeSettingsListener } from '../config.js';
import { TranslationEngine } from './translation-engine.js';
import { MessageRouter } from './message-router.js';
import * as Handlers from './handlers/index.js';

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
    this.messageRouter = new MessageRouter(); // NEW: Instantiate MessageRouter
    // Define handleCentralMessageWrapper as a class property (arrow function) here
    this.handleCentralMessageWrapper = (request, sender, sendResponse) => {
      console.log('[BackgroundService] Forwarding message to router:', request.action);
      // Route the message through the central router
      // The router will handle dispatching to the correct handler and error management
      return this.messageRouter.routeMessage(request, sender, sendResponse);
    };
  }

  /**
   * Initialize the background service
   */
  async initialize() {
    if (this.initialized) {
      console.log('🔄 Background service already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing cross-browser background service...');

      // Initialize environment and browser API
      await this.initializeBrowserAPI();
      
      // Initialize NotificationManager
      this.notificationManager = new NotificationManager();
      this.notificationManager.initialize();
      
      // Load Vue message handler
      await this.initializeVueMessageHandler();
      
      // Initialize translation engine
      await this.initializeTranslationEngine();

      
      
      // Load listeners
      await this.initializeListeners();
      
      // Pre-load essential features
      await this.initializeFeatures();

      // NEW: Register handlers with the MessageRouter during initialization
      this.registerMessageHandlers();

      // Setup central message listener
      await this.setupCentralMessageListener();

      this.initialized = true;
      
      console.log('✅ Background service initialized successfully');
      console.log('📊 Service info:', this.getDebugInfo());

    } catch (error) {
      console.error('❌ Background service initialization failed:', error);
      
      // Try to initialize with minimal functionality
      await this.initializeMinimal();
      
      throw error;
    }
  }

  /**
   * Initialize browser API
   * @private
   */
  async initializeBrowserAPI() {
    console.log('🌐 Initializing browser API...');
    
    this.browser = await getBrowserAPI();
    
    // Make globally available for legacy code
    globalThis.Browser = this.browser;
    globalThis.browser = this.browser;
    
    if (typeof self !== 'undefined') {
      self.Browser = this.browser;
      self.browser = this.browser;
    }

    const browserName = environment.getBrowser();

    console.log(`✅ Browser API initialized for ${browserName}`);

    // Initialize settings listener with the fully initialized Browser object
    await initializeSettingsListener(this.browser);
  }

  /**
   * Initialize Vue message handler
   * @private
   */
  async initializeVueMessageHandler() {
    console.log('📡 Initializing Vue message handler...');
    
    try {

      this.vueMessageHandler = new VueMessageHandler();
      await this.vueMessageHandler.register();
      
      console.log('✅ Vue message handler registered');
    } catch (error) {
      console.error('❌ Failed to initialize Vue message handler:', error);
      throw error;
    }
  }

  /**
   * Initialize translation engine
   * @private
   */
  async initializeTranslationEngine() {
    console.log('🔄 Initializing translation engine...');
    
    try {
      this.translationEngine = new TranslationEngine();
      await this.translationEngine.initialize();
      
      console.log('✅ Translation engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize translation engine:', error);
      throw error;
    }
  }

  /**
   * Initialize event listeners
   * @private
   */
  async initializeListeners() {
    console.log('🎧 Initializing event listeners...');
    
    try {
      this.listeners = await featureLoader.loadAllListeners();
      console.log(`✅ Loaded ${this.listeners.length} listeners`);
    } catch (error) {
      console.error('❌ Failed to load some listeners:', error);
      // Continue with available listeners
    }
  }

  /**
   * Initialize and pre-load features
   * @private
   */
  async initializeFeatures() {
    console.log('🚀 Pre-loading essential features...');
    
    try {
      this.features = await featureLoader.preloadEssentialFeatures();
      console.log('✅ Essential features loaded:', Object.keys(this.features));
    } catch (error) {
      console.error('❌ Failed to load some features:', error);
      // Continue with available features
    }
  }

  /**
   * Initialize with minimal functionality if full initialization fails
   * @private
   */
  async initializeMinimal() {
    console.log('🔧 Attempting minimal initialization...');
    
    try {
      // At minimum, try to get browser API
      if (!this.browser) {
        this.browser = await getBrowserAPI();
        globalThis.Browser = this.browser;
        globalThis.browser = this.browser;
      }

      // Try to load Vue message handler
      if (!this.vueMessageHandler) {
        try {
     // Import the class
          this.vueMessageHandler = new VueMessageHandler(); // Instantiate the class
          await this.vueMessageHandler.register();
        } catch (error) {
          console.error('Vue message handler unavailable in minimal mode');
        }
      }

      // Try to initialize translation engine
      if (!this.translationEngine) {
        try {
          this.translationEngine = new TranslationEngine();
          await this.translationEngine.initialize();
        } catch (error) {
          console.error('Translation engine unavailable in minimal mode');
        }
      }

      // CRITICAL: Set up MessageRouter even in minimal mode
      try {
        this.registerMessageHandlers();
        await this.setupCentralMessageListener();
        console.log('✅ MessageRouter set up in minimal mode');
      } catch (error) {
        console.error('❌ Failed to set up MessageRouter in minimal mode:', error);
      }

      console.log('🔧 Minimal initialization completed');
      this.initialized = true;

    } catch (_error) {
      console.error('❌ Even minimal initialization failed:', _error);
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
      browser: environment.getBrowser(),
      features: Object.keys(this.features),
      listeners: this.listeners.length,
      hasVueHandler: !!this.vueMessageHandler,
      hasTranslationEngine: !!this.translationEngine,
      translationStats: this.translationEngine ? this.translationEngine.getCacheStats() : null,
      environment: environment.getDebugInfo(),
      featureLoader: featureLoader.getDebugInfo()
    };
  }

  /**
   * Setup central message listener to route messages to appropriate handlers
   * @private
   */
  async setupCentralMessageListener() {
    console.log('👂 Setting up central message listener...');
    const Browser = await getBrowserAPI();

    // Remove any existing listener to prevent duplicates
    if (this.handleCentralMessageWrapper) {
      Browser.runtime.onMessage.removeListener(this.handleCentralMessageWrapper);
      console.log('🗑️ Removed existing central message listener.');
    }

    Browser.runtime.onMessage.addListener(this.handleCentralMessageWrapper); // Pass the function directly
    console.log('✅ Central message listener set up');
  }

  // NEW METHOD: Register all message handlers
  registerMessageHandlers() {
    console.log('[BackgroundService] Registering message handlers...');
    
    // Common handlers
    this.messageRouter.registerHandler('ping', Handlers.handlePing);
    this.messageRouter.registerHandler('open_options_page', Handlers.handleOpenOptionsPage);
    this.messageRouter.registerHandler('open_url', Handlers.handleOpenURL);
    this.messageRouter.registerHandler('show_os_notification', Handlers.handleShowOSNotification);
    this.messageRouter.registerHandler('REFRESH_CONTEXT_MENUS', Handlers.handleRefreshContextMenus);
    this.messageRouter.registerHandler('CONTENT_SCRIPT_WILL_RELOAD', Handlers.handleContentScriptWillReload);
    
    // Lifecycle handlers
    this.messageRouter.registerHandler('CONTEXT_INVALID', Handlers.handleContextInvalid);
    this.messageRouter.registerHandler('EXTENSION_RELOADED', Handlers.handleExtensionReloaded);
    this.messageRouter.registerHandler('restart_content_script', Handlers.handleRestartContentScript);
    this.messageRouter.registerHandler('BACKGROUND_RELOAD_EXTENSION', Handlers.handleBackgroundReloadExtension);
    
    // Translation handlers
    this.messageRouter.registerHandler('TRANSLATE', Handlers.handleTranslate);
    this.messageRouter.registerHandler('fetchTranslation', Handlers.handleFetchTranslation);
    this.messageRouter.registerHandler('translationAdded', Handlers.handleTranslationAdded);
    this.messageRouter.registerHandler('fetchTranslationBackground', Handlers.handleFetchTranslationBackground);
    this.messageRouter.registerHandler('revertTranslation', Handlers.handleRevertTranslation);
    
    // TTS handlers
    this.messageRouter.registerHandler('speak', Handlers.handleSpeak);
    this.messageRouter.registerHandler('stopTTS', Handlers.handleStopTTS);
    
    // Element selection handlers
    this.messageRouter.registerHandler('activateSelectElementMode', Handlers.handleActivateSelectElementMode);
    this.messageRouter.registerHandler('UPDATE_SELECT_ELEMENT_STATE', Handlers.handleUpdateSelectElementState);
    this.messageRouter.registerHandler('elementSelected', Handlers.handleElementSelected);
    this.messageRouter.registerHandler('applyTranslationToActiveElement', Handlers.handleApplyTranslationToActiveElement);
    
    // Screen capture handlers
    this.messageRouter.registerHandler('startAreaCapture', Handlers.handleStartAreaCapture);
    this.messageRouter.registerHandler('startFullScreenCapture', Handlers.handleStartFullScreenCapture);
    this.messageRouter.registerHandler('requestFullScreenCapture', Handlers.handleRequestFullScreenCapture);
    this.messageRouter.registerHandler('processAreaCaptureImage', Handlers.handleProcessAreaCaptureImage);
    this.messageRouter.registerHandler('previewConfirmed', Handlers.handlePreviewConfirmed);
    this.messageRouter.registerHandler('previewCancelled', Handlers.handlePreviewCancelled);
    this.messageRouter.registerHandler('previewRetry', Handlers.handlePreviewRetry);
    this.messageRouter.registerHandler('resultClosed', Handlers.handleResultClosed);
    this.messageRouter.registerHandler('captureError', Handlers.handleCaptureError);
    this.messageRouter.registerHandler('areaSelectionCancel', Handlers.handleAreaSelectionCancel);
    
    // Text selection handlers
    this.messageRouter.registerHandler('getSelectedText', Handlers.handleGetSelectedText);
    
    // Page exclusion handlers
    this.messageRouter.registerHandler('isCurrentPageExcluded', Handlers.handleIsCurrentPageExcluded);
    this.messageRouter.registerHandler('setExcludeCurrentPage', Handlers.handleSetExcludeCurrentPage);
    
    // Sidepanel handlers
    this.messageRouter.registerHandler('OPEN_SIDE_PANEL', Handlers.handleOpenSidePanel);
    
    console.log('[BackgroundService] All message handlers registered successfully.');
  }

  /**
   * Shutdown the background service (for testing)
   */
  async shutdown() {
    console.log('🛑 Shutting down background service...');
    
    // Clear feature loader cache
    featureLoader.clearCache();
    
    // Reset state
    this.initialized = false;
    this.features = {};
    this.listeners = [];
    this.vueMessageHandler = null;
    this.translationEngine = null;
    
    console.log('🛑 Background service shutdown complete');
  }
}

// Create and initialize background service
const backgroundService = new BackgroundService();

// Initialize immediately
backgroundService.initialize().catch((_error) => {
  console.error('💥 Critical: Background service initialization failed:', _error);
  
  // Report error to extension pages if possible
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({
      type: 'BACKGROUND_INIT_ERROR',
      error: _error.message,
      stack: _error.stack
    }).catch(() => {
      // Ignore if no listeners
    });
  }
});

// Export for debugging
globalThis.backgroundService = backgroundService;

// Handle service worker lifecycle
if (typeof self !== 'undefined' && 'serviceWorker' in self) {
  self.addEventListener('install', (event) => {
    console.log('🔧 Service worker installing...');
    event.waitUntil(self.skipWaiting());
  });

  self.addEventListener('activate', (event) => {
    console.log('🔧 Service worker activating...');
    event.waitUntil(self.clients.claim());
  });

  // Handle unhandled promise rejections
  self.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection in service worker:', event.reason);
  });
}

// Handle uncaught errors
if (typeof self !== 'undefined') {
  self.addEventListener('error', (event) => {
    console.error('🚨 Uncaught error in service worker:', event.error);
  });
}

export { backgroundService };
