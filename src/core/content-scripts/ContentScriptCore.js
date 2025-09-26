// src/core/content-scripts/ContentScriptCore.js
// Critical infrastructure for content script - minimal initial load

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { checkContentScriptAccess } from "@/core/tabPermissions.js";
import ExtensionContextManager from '@/core/extensionContext.js';
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js';

// Import Main DOM CSS as raw string for injection
import mainDomCss from '@/assets/styles/content-main-dom.scss?inline';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScriptCore');

export class ContentScriptCore extends EventTarget {
  constructor() {
    super();
    this.initialized = false;
    this.vueLoaded = false;
    this.featuresLoaded = false;
    this.messageHandler = null;
    this.accessChecked = false;
    this.access = null;
  }

  async initialize() {
    if (this.initialized) {
      logger.debug('ContentScriptCore already initialized');
      return;
    }

    try {
      logger.init('Initializing ContentScriptCore...');

      // Check access first
      this.access = checkContentScriptAccess();
      this.accessChecked = true;

      logger.debug('Content script access check result:', {
        isAccessible: this.access.isAccessible,
        errorMessage: this.access.errorMessage,
        url: window.location.href,
        isInIframe: window !== window.top
      });

      if (!this.access.isAccessible) {
        logger.warn(`Content script execution stopped: ${this.access.errorMessage}`);
        return false;
      }

      // Prevent duplicate execution
      if (window.translateItContentScriptLoaded) {
        logger.debug('Content script already loaded, stopping duplicate execution');
        return false;
      }
      window.translateItContentScriptLoaded = true;

      // Initialize core infrastructure
      await this.initializeCore();

      // Setup message handler
      await this.initializeMessaging();

      // Inject critical CSS if in main frame
      if (!this.isInIframe()) {
        await this.injectMainDOMStyles();
      }

      this.initialized = true;
      logger.info('ContentScriptCore initialized successfully');

      // Auto-load Vue for main frame (most common use case)
      if (!this.isInIframe()) {
        // Small delay to allow page to load
        setTimeout(() => {
          this.loadVueApp();
        }, 100);
      }

      return true;

    } catch (error) {
      logger.error('Failed to initialize ContentScriptCore:', error);
      return false;
    }
  }

  async initializeCore() {
    // Validate extension context
    if (!this.validateExtensionContext('core-initialization')) {
      return;
    }

    // Setup basic infrastructure
    // Note: Heavy imports like Vue, FeatureManager are loaded lazily

    logger.debug('Core infrastructure initialized');
  }

  async initializeMessaging() {
    if (!this.validateExtensionContext('messaging-initialization')) {
      return;
    }

    try {
      // Create message handler for core communication
      this.messageHandler = createMessageHandler();

      // Register core handlers
      await this.registerCoreHandlers();

      // Activate the message listener
      if (!this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
        logger.debug('Core message handler activated');
      }

    } catch (error) {
      logger.error('Failed to initialize messaging:', error);
    }
  }

  async registerCoreHandlers() {
    // Register essential handlers only
    // Feature-specific handlers are loaded with features

    // Handler for checking if content script is ready
    this.messageHandler.registerHandler('contentScriptReady', async () => {
      return { ready: true, vueLoaded: this.vueLoaded, featuresLoaded: this.featuresLoaded };
    });

    // Handler for triggering Vue app load
    this.messageHandler.registerHandler('loadVueApp', async () => {
      await this.loadVueApp();
      return { success: true };
    });

    // Handler for triggering features load
    this.messageHandler.registerHandler('loadFeatures', async () => {
      await this.loadFeatures();
      return { success: true };
    });
  }

  async loadVueApp() {
    if (this.vueLoaded) {
      logger.debug('Vue app already loaded');
      return;
    }

    try {
      logger.debug('Loading Vue app lazily...');

      // Load Vue app and all its dependencies
      const { loadVueApp } = await import('./chunks/lazy-vue-app.js');
      await loadVueApp(this);

      this.vueLoaded = true;
      this.dispatchEvent(new CustomEvent('vue-loaded'));
      logger.info('Vue app loaded successfully');

    } catch (error) {
      logger.error('Failed to load Vue app:', error);
      // Fallback: try to load legacy style
      await this.fallbackVueLoad();
    }
  }

  async loadFeatures() {
    if (this.featuresLoaded) {
      logger.debug('Features already loaded');
      return;
    }

    try {
      logger.debug('Loading features lazily...');

      // Load FeatureManager and all features
      const { loadFeatures } = await import('./chunks/lazy-features.js');
      await loadFeatures(this);

      this.featuresLoaded = true;
      this.dispatchEvent(new CustomEvent('features-loaded'));
      logger.info('Features loaded successfully');

    } catch (error) {
      logger.error('Failed to load features:', error);
      await this.fallbackFeaturesLoad();
    }
  }

  async fallbackVueLoad() {
    logger.warn('Attempting fallback Vue load...');
    // Import and initialize Vue the old way
    const { initializeLegacyHandlers } = await import('./legacy-handlers.js');
    await initializeLegacyHandlers(this);
  }

  async fallbackFeaturesLoad() {
    logger.warn('Attempting fallback features load...');
    // Initialize features the old way
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    const featureManager = FeatureManager.getInstance();
    await featureManager.initialize();
  }

  async injectMainDOMStyles() {
    if (!this.validateExtensionContext('main-dom-css-injection')) {
      return;
    }

    // Check if already injected
    if (document.getElementById('translate-it-main-dom-styles')) {
      return;
    }

    try {
      const styleElement = document.createElement('style');
      styleElement.id = 'translate-it-main-dom-styles';
      styleElement.textContent = mainDomCss;

      document.head.appendChild(styleElement);
      logger.debug('Main DOM styles injected');

    } catch (error) {
      logger.error('Failed to inject Main DOM CSS:', error);
    }
  }

  validateExtensionContext(operation = 'unknown') {
    if (!ExtensionContextManager.isValidSync()) {
      logger.debug(`Extension context invalid - ${operation} skipped`);
      return false;
    }
    return true;
  }

  isInIframe() {
    return window !== window.top;
  }

  isAccessible() {
    return this.accessChecked && this.access.isAccessible;
  }

  isVueLoaded() {
    return this.vueLoaded;
  }

  areFeaturesLoaded() {
    return this.featuresLoaded;
  }

  getMessageHandler() {
    return this.messageHandler;
  }

  // Cleanup method
  cleanup() {
    logger.debug('Cleaning up ContentScriptCore...');

    if (this.messageHandler) {
      this.messageHandler.cleanup();
    }

    this.vueLoaded = false;
    this.featuresLoaded = false;
    this.initialized = false;

    logger.debug('ContentScriptCore cleaned up');
  }
}

// Export singleton instance
export const contentScriptCore = new ContentScriptCore();