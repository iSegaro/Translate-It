// Background script entry point for Vue build
// Cross-browser service worker for Manifest V3

import { environment } from '../utils/environment.js';
import { getBrowserAPI } from '../utils/browser-unified.js';
import { featureLoader } from './feature-loader.js';
import { VueMessageHandler } from './vue-message-handler.js';
import NotificationManager from '../managers/NotificationManager.js';
import { initializeSettingsListener } from '../config.js';

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
      
      // Load listeners
      await this.initializeListeners();
      
      // Pre-load essential features
      await this.initializeFeatures();

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

      console.log('🔧 Minimal initialization completed');
      this.initialized = true;

    } catch (_error) {
      console.error('❌ Even minimal initialization failed:', _error);
      throw _error;
    }
  }

  /**
   * Get TTS manager
   * @returns {Promise<Object>} TTS manager instance
   */
  async getTTSManager() {
    return await featureLoader.loadTTSManager();
  }

  /**
   * Get panel manager  
   * @returns {Promise<Object>} Panel manager instance
   */
  async getPanelManager() {
    return await featureLoader.loadPanelManager();
  }

  /**
   * Get screen capture manager
   * @returns {Promise<Object>} Screen capture manager instance
   */
  async getScreenCaptureManager() {
    return await featureLoader.loadScreenCaptureManager();
  }

  /**
   * Check if service is initialized
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
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
      environment: environment.getDebugInfo(),
      featureLoader: featureLoader.getDebugInfo()
    };
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
