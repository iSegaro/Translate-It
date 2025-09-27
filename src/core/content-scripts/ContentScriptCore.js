// src/core/content-scripts/ContentScriptCore.js
// Critical infrastructure for content script - minimal initial load

// Lazy load all dependencies to reduce initial bundle size
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;
let checkContentScriptAccess = null;
let ExtensionContextManager = null;
let createMessageHandler = null;
let mainDomCss = '';

// Async initialization function to load dependencies
async function loadDependencies() {
  if (logger) return; // Already loaded

  const [
    loggerModule,
    logConstantsModule,
    tabPermissionsModule,
    extensionContextModule,
    messageHandlerModule
  ] = await Promise.all([
    import("@/shared/logging/logger.js"),
    import("@/shared/logging/logConstants.js"),
    import("@/core/tabPermissions.js"),
    import('@/core/extensionContext.js'),
    import('@/shared/messaging/core/MessageHandler.js')
  ]);

  getScopedLogger = loggerModule.getScopedLogger;
  LOG_COMPONENTS = logConstantsModule.LOG_COMPONENTS;
  checkContentScriptAccess = tabPermissionsModule.checkContentScriptAccess;
  ExtensionContextManager = extensionContextModule.default;
  createMessageHandler = messageHandlerModule.createMessageHandler;

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
      if (logger) logger.debug('ContentScriptCore already initialized');
      return;
    }

    try {
      // Load dependencies first
      await loadDependencies();

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
      if (logger) {
        logger.error('Failed to initialize ContentScriptCore:', error);
      } else {
        console.error('Failed to initialize ContentScriptCore:', error);
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
        logger.debug('Pre-initializing FeatureManager...');
        const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
        await loadCoreFeatures();
        logger.debug('FeatureManager pre-initialized successfully');
      } catch (error) {
        logger.warn('Failed to pre-initialize FeatureManager:', error);
        // Don't fail critical initialization if FeatureManager fails
      }

      this.initialized = true;

      if (logger) {
        logger.debug('ContentScriptCore critical initialization complete');
      }

      return true;

    } catch (error) {
      console.error('Failed to initialize ContentScriptCore critically:', error);
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
      messageHandlerModule
    ] = await Promise.all([
      import("@/shared/logging/logger.js"),
      import("@/shared/logging/logConstants.js"),
      import("@/core/tabPermissions.js"),
      import('@/core/extensionContext.js'),
      import('@/shared/messaging/core/MessageHandler.js')
    ]);

    getScopedLogger = loggerModule.getScopedLogger;
    LOG_COMPONENTS = logConstantsModule.LOG_COMPONENTS;
    checkContentScriptAccess = tabPermissionsModule.checkContentScriptAccess;
    ExtensionContextManager = extensionContextModule.default;
    createMessageHandler = messageHandlerModule.createMessageHandler;

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

    if (logger) logger.debug('Core infrastructure initialized');
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
        if (logger) logger.debug('Core message handler activated');
      }

    } catch (error) {
      if (logger) {
        logger.error('Failed to initialize messaging:', error);
      } else {
        console.error('Failed to initialize messaging:', error);
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

      // Load only core features initially
      const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
      await loadCoreFeatures();

      this.featuresLoaded = true;
      this.dispatchEvent(new CustomEvent('features-loaded'));
      logger.info('Core features loaded successfully');

    } catch (error) {
      logger.error('Failed to load core features:', error);
      await this.fallbackFeaturesLoad();
    }
  }

  async loadFeature(featureName) {
    try {
      const { loadFeatureOnDemand } = await import('./chunks/lazy-features.js');
      return await loadFeatureOnDemand(featureName);
    } catch (error) {
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
      logger.debug('Extension context validation failed for CSS injection');
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
      logger.debug('Main DOM CSS content check:', {
        hasCss: !!mainDomCss,
        cssLength: mainDomCss ? mainDomCss.length : 0,
        cssPreview: mainDomCss ? mainDomCss.substring(0, 200) + '...' : 'null',
        hasHighlightRule: mainDomCss ? mainDomCss.includes('translate-it-element-highlighted') : false
      });

      if (mainDomCss && mainDomCss.includes('translate-it-element-highlighted')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'translate-it-main-dom-styles';
        styleElement.textContent = mainDomCss;
        document.head.appendChild(styleElement);
        logger.debug('Main DOM styles injected via inline style element');
      } else {
        logger.error('Main DOM CSS does not contain highlight rules');
      }
    } catch (error) {
      logger.error('Failed to inject Main DOM CSS:', error);
    }
  }

  validateExtensionContext(operation = 'unknown') {
    if (!ExtensionContextManager || !ExtensionContextManager.isValidSync()) {
      if (logger) {
        logger.debug(`Extension context invalid - ${operation} skipped`);
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
      logger.debug('Cleaning up ContentScriptCore...');
    }

    if (this.messageHandler) {
      this.messageHandler.cleanup();
    }

    this.vueLoaded = false;
    this.featuresLoaded = false;
    this.initialized = false;

    if (logger) {
      logger.debug('ContentScriptCore cleaned up');
    }
  }
}

// Export singleton instance
export const contentScriptCore = new ContentScriptCore();