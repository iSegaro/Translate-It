// src/core/content-scripts/ContentScriptCore.js
// Critical infrastructure for content script - minimal initial load

// Lazy load all dependencies to reduce initial bundle size
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;
let checkContentScriptAccess = null;
let ExtensionContextManager = null;
let createMessageHandler = null;
let ErrorHandler = null;
let mainDomCss = '';

// Async initialization function to load dependencies
async function loadDependencies() {
  if (logger) return; // Already loaded

  const [
    loggerModule,
    logConstantsModule,
    tabPermissionsModule,
    extensionContextModule,
    messageHandlerModule,
    errorHandlerModule
  ] = await Promise.all([
    import("@/shared/logging/logger.js"),
    import("@/shared/logging/logConstants.js"),
    import("@/core/tabPermissions.js"),
    import('@/core/extensionContext.js'),
    import('@/shared/messaging/core/MessageHandler.js'),
    import('@/shared/error-management/ErrorHandler.js')
  ]);

  getScopedLogger = loggerModule.getScopedLogger;
  LOG_COMPONENTS = logConstantsModule.LOG_COMPONENTS;
  checkContentScriptAccess = tabPermissionsModule.checkContentScriptAccess;
  ExtensionContextManager = extensionContextModule.default;
  createMessageHandler = messageHandlerModule.createMessageHandler;
  ErrorHandler = errorHandlerModule.ErrorHandler;

  // Define CSS directly as a string to avoid import issues
  mainDomCss = `html[data-translate-it-select-mode="true"]{cursor:crosshair!important}html[data-translate-it-select-mode="true"] *{cursor:crosshair!important}html[data-translate-it-select-mode="true"] body{cursor:crosshair!important}html[data-translate-it-select-mode="true"] body *{cursor:crosshair!important}html[data-translate-it-select-mode="true"] a:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] button:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [onclick]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [role="link"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] div[role="link"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] input[type="submit"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] input[type="button"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [href]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]){pointer-events:none!important;color:inherit!important;text-decoration:none!important}:root{--translate-highlight-color:#ff8800;--translate-highlight-width:3px;--translate-highlight-offset:2px;--translate-highlight-z-index:1040}html body [data-translate-highlighted="true"][data-translate-highlighted="true"],html body .translate-it-element-highlighted.translate-it-element-highlighted{outline:var(--translate-highlight-width) solid var(--translate-highlight-color)!important;outline-offset:var(--translate-highlight-offset)!important;z-index:var(--translate-highlight-z-index)!important;position:relative!important;box-shadow:0 0 0 var(--translate-highlight-width) var(--translate-highlight-color)!important}html body [data-translate-highlighted="true"][data-translate-highlighted="true"] *,html body .translate-it-element-highlighted.translate-it-element-highlighted *{outline:none!important}`;

  logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScriptCore');
}

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
      // logger.trace('ContentScriptCore already initialized');
      return;
    }

    try {
      // Load dependencies first
      await loadDependencies();

      // logger.trace('Initializing ContentScriptCore...');

      // Check access first
      this.access = checkContentScriptAccess();
      this.accessChecked = true;

      // logger.trace('Content script access check result:', {
      //   isAccessible: this.access.isAccessible,
      //   errorMessage: this.access.errorMessage,
      //   url: window.location.href,
      //   isInIframe: window !== window.top
      // });

      if (!this.access.isAccessible) {
        logger.warn(`Content script execution stopped: ${this.access.errorMessage}`);
        return false;
      }

      // Prevent duplicate execution
      if (window.translateItContentScriptLoaded) {
        // logger.trace('Content script already loaded, stopping duplicate execution');
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
      // Use ErrorHandler for critical initialization errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'content-script-initialization',
          isSilent: false,
          showToast: true
        });
      }

      if (logger) {
        logger.error('Failed to initialize ContentScriptCore', {
          error: error.message || error,
          stack: error.stack,
          url: window.location.href,
          isInIframe: window !== window.top
        });
      } else {
        // Fallback: create a temporary logger instance
        console.error('[ContentScriptCore] Failed to initialize:', {
          error: error.message || error,
          url: window.location.href,
          isInIframe: window !== window.top
        });
      }
      return false;
    }
  }

  async initializeCritical() {
    // Ultra-minimal initialization for critical features only
    if (this.initialized) {
      return true;
    }

    try {
      // Load only critical dependencies
      await this.loadCriticalDependencies();

      // Check access
      this.access = checkContentScriptAccess();
      this.accessChecked = true;

      if (!this.access.isAccessible) {
        return false;
      }

      // Prevent duplicate execution
      if (window.translateItContentScriptLoaded) {
        return false;
      }
      window.translateItContentScriptLoaded = true;

      // Initialize only essential messaging
      await this.initializeCriticalMessaging();

      // Inject critical CSS for all features that need it if in main frame
      if (!this.isInIframe()) {
        await this.injectMainDOMStyles();
      }

      // Pre-initialize FeatureManager for RevertShortcut and other features
      // This ensures FeatureManager is available globally before any features need it
      try {
        // logger.trace('Pre-initializing FeatureManager...');
        const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
        await loadCoreFeatures();
        // logger.trace('FeatureManager pre-initialized successfully');
      } catch (error) {
        // Use ErrorHandler for FeatureManager pre-initialization errors
        if (ErrorHandler) {
          const errorHandler = ErrorHandler.getInstance();
          await errorHandler.handle(error, {
            context: 'feature-manager-pre-initialization',
            isSilent: true, // FeatureManager pre-init is not critical
            showToast: false
          });
        }

        logger.warn('Failed to pre-initialize FeatureManager:', error);
        // Don't fail critical initialization if FeatureManager fails
      }

      this.initialized = true;

      if (logger) {
        logger.info('ContentScriptCore critical initialization complete');
      }

      return true;

    } catch (error) {
      // Use ErrorHandler for critical initialization errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'content-script-critical-initialization',
          isSilent: false,
          showToast: true
        });
      }

      // Use a structured error object even when logger is not available
      const errorContext = {
        operation: 'critical-initialization',
        error: error.message || error,
        stack: error.stack,
        url: window.location.href,
        isInIframe: window !== window.top
      };

      if (logger) {
        logger.error('Failed to initialize ContentScriptCore critically', errorContext);
      } else {
        console.error('[ContentScriptCore] Failed to initialize critically:', errorContext);
      }
      return false;
    }
  }

  async loadCriticalDependencies() {
    // Load only essential dependencies for critical features
    const [
      loggerModule,
      logConstantsModule,
      tabPermissionsModule,
      extensionContextModule,
      messageHandlerModule,
      errorHandlerModule
    ] = await Promise.all([
      import("@/shared/logging/logger.js"),
      import("@/shared/logging/logConstants.js"),
      import("@/core/tabPermissions.js"),
      import('@/core/extensionContext.js'),
      import('@/shared/messaging/core/MessageHandler.js'),
      import('@/shared/error-management/ErrorHandler.js')
    ]);

    getScopedLogger = loggerModule.getScopedLogger;
    LOG_COMPONENTS = logConstantsModule.LOG_COMPONENTS;
    checkContentScriptAccess = tabPermissionsModule.checkContentScriptAccess;
    ExtensionContextManager = extensionContextModule.default;
    createMessageHandler = messageHandlerModule.createMessageHandler;
    ErrorHandler = errorHandlerModule.ErrorHandler;

    // Define CSS directly as a string to avoid import issues
    mainDomCss = `html[data-translate-it-select-mode="true"]{cursor:crosshair!important}html[data-translate-it-select-mode="true"] *{cursor:crosshair!important}html[data-translate-it-select-mode="true"] body{cursor:crosshair!important}html[data-translate-it-select-mode="true"] body *{cursor:crosshair!important}html[data-translate-it-select-mode="true"] a:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] button:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [onclick]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [role="link"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] div[role="link"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] input[type="submit"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] input[type="button"]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]),html[data-translate-it-select-mode="true"] [href]:not([data-sonner-toast]):not([data-sonner-toaster]):not([data-translate-ui]){pointer-events:none!important;color:inherit!important;text-decoration:none!important}:root{--translate-highlight-color:#ff8800;--translate-highlight-width:3px;--translate-highlight-offset:2px;--translate-highlight-z-index:1040}html body [data-translate-highlighted="true"][data-translate-highlighted="true"],html body .translate-it-element-highlighted.translate-it-element-highlighted{outline:var(--translate-highlight-width) solid var(--translate-highlight-color)!important;outline-offset:var(--translate-highlight-offset)!important;z-index:var(--translate-highlight-z-index)!important;position:relative!important;box-shadow:0 0 0 var(--translate-highlight-width) var(--translate-highlight-color)!important}html body [data-translate-highlighted="true"][data-translate-highlighted="true"] *,html body .translate-it-element-highlighted.translate-it-element-highlighted *{outline:none!important}`;

    logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentScriptCore');
  }

  async initializeCriticalMessaging() {
    // Set up minimal messaging for critical features
    try {
      const { createMessageHandler } = await import('@/shared/messaging/core/MessageHandler.js');
      this.messageHandler = createMessageHandler();

      // Register only essential handlers
      this.messageHandler.registerHandler('contentScriptReady', async () => {
        return { ready: true, vueLoaded: this.vueLoaded, featuresLoaded: this.featuresLoaded };
      });

      if (!this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
      }
    } catch (error) {
      // Use ErrorHandler for messaging initialization errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'critical-messaging-initialization',
          isSilent: true, // Messaging failures are not critical for basic functionality
          showToast: false
        });
      }

      if (logger) {
        logger.warn('Failed to initialize critical messaging:', error);
      }
    }
  }

  async initializeCore() {
    // Validate extension context
    if (!this.validateExtensionContext('core-initialization')) {
      return;
    }

    // Setup basic infrastructure
    // Note: Heavy imports like Vue, FeatureManager are loaded lazily

    // logger.trace('Core infrastructure initialized');
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
        // logger.trace('Core message handler activated');
      }

    } catch (error) {
      // Use ErrorHandler for messaging errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'messaging-initialization',
          isSilent: true, // Messaging failures are not critical
          showToast: false
        });
      }

      const errorContext = {
        operation: 'messaging-initialization',
        error: error.message || error,
        stack: error.stack,
        messageHandlerInitialized: !!this.messageHandler
      };

      if (logger) {
        logger.error('Failed to initialize messaging', errorContext);
      } else {
        console.error('[ContentScriptCore] Failed to initialize messaging:', errorContext);
      }
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
      // logger.trace('Vue app already loaded');
      return;
    }

    try {
      logger.info('Loading Vue app lazily...');

      // Load Vue app and all its dependencies
      const { loadVueApp } = await import('./chunks/lazy-vue-app.js');
      await loadVueApp(this);

      this.vueLoaded = true;
      this.dispatchEvent(new CustomEvent('vue-loaded'));
      logger.info('Vue app loaded successfully');

    } catch (error) {
      // Use ErrorHandler for Vue loading errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'vue-app-loading',
          isSilent: true, // Vue loading failures should not interrupt user
          showToast: false
        });
      }

      logger.error('Failed to load Vue app:', error);
      // Fallback: try to load legacy style
      await this.fallbackVueLoad();
    }
  }

  async loadFeatures() {
    if (this.featuresLoaded) {
      // logger.trace('Features already loaded');
      return;
    }

    try {
      logger.info('Loading features lazily...');

      // Load only core features initially
      const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
      await loadCoreFeatures();

      this.featuresLoaded = true;
      this.dispatchEvent(new CustomEvent('features-loaded'));
      logger.info('Core features loaded successfully');

    } catch (error) {
      // Use ErrorHandler for features loading errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'features-loading',
          isSilent: true, // Features loading failures should not interrupt user
          showToast: false
        });
      }

      logger.error('Failed to load core features:', error);
      await this.fallbackFeaturesLoad();
    }
  }

  async loadFeature(featureName) {
    try {
      const { loadFeatureOnDemand } = await import('./chunks/lazy-features.js');
      return await loadFeatureOnDemand(featureName);
    } catch (error) {
      // Use ErrorHandler for individual feature loading errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: `feature-loading-${featureName}`,
          isSilent: true, // Individual feature failures should not interrupt user
          showToast: false
        });
      }

      logger.error(`Failed to load feature ${featureName}:`, error);
      return null;
    }
  }

  getFeature(featureName) {
    try {
      const { getFeature } = require('./chunks/lazy-features.js');
      return getFeature(featureName);
    } catch {
      return null;
    }
  }

  async fallbackVueLoad() {
    logger.info('Attempting fallback Vue load...');
    // Import and initialize Vue the old way
    const { initializeLegacyHandlers } = await import('./legacy-handlers.js');
    await initializeLegacyHandlers(this);
  }

  async fallbackFeaturesLoad() {
    logger.info('Attempting fallback features load...');
    // Initialize features the old way
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    const featureManager = FeatureManager.getInstance();
    await featureManager.initialize();
  }

  async injectMainDOMStyles() {
    if (!this.validateExtensionContext('main-dom-css-injection')) {
      // logger.trace('Extension context validation failed for CSS injection');
      return;
    }

    // Check if already injected and working
    const existingStyle = document.getElementById('translate-it-main-dom-styles');

    if (existingStyle) {
      // Verify the CSS is actually working by checking if variables are defined
      const rootStyles = getComputedStyle(document.documentElement);
      const highlightColor = rootStyles.getPropertyValue('--translate-highlight-color');

      if (highlightColor && highlightColor.trim() !== '') {
        return; // CSS is already working
      }

      // CSS exists but variables are not defined, remove and re-inject
      existingStyle.remove();
    }

    try {
      // Use style element with inline CSS
      // logger.trace('Main DOM CSS content check:', {
      //   hasCss: !!mainDomCss,
      //   cssLength: mainDomCss ? mainDomCss.length : 0,
      //   cssPreview: mainDomCss ? mainDomCss.substring(0, 200) + '...' : 'null',
      //   hasHighlightRule: mainDomCss ? mainDomCss.includes('translate-it-element-highlighted') : false
      // });

      if (mainDomCss && mainDomCss.includes('translate-it-element-highlighted')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'translate-it-main-dom-styles';
        styleElement.textContent = mainDomCss;
        document.head.appendChild(styleElement);
        // logger.trace('Main DOM styles injected via inline style element');
      } else {
        logger.error('Main DOM CSS does not contain highlight rules');
      }
    } catch (error) {
      // Use ErrorHandler for CSS injection errors
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'main-dom-css-injection',
          isSilent: true, // CSS injection failures are not critical
          showToast: false
        });
      }

      logger.error('Failed to inject Main DOM CSS:', error);
    }
  }

  validateExtensionContext(operation = 'unknown') {
    if (!ExtensionContextManager || !ExtensionContextManager.isValidSync()) {
      if (logger) {
        // logger.trace(`Extension context invalid - ${operation} skipped`);
      }
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
    if (logger) {
      // logger.trace('Cleaning up ContentScriptCore...');
    }

    if (this.messageHandler) {
      this.messageHandler.cleanup();
    }

    this.vueLoaded = false;
    this.featuresLoaded = false;
    this.initialized = false;

    if (logger) {
      logger.info('ContentScriptCore cleaned up');
    }
  }
}

// Export singleton instance
export const contentScriptCore = new ContentScriptCore();