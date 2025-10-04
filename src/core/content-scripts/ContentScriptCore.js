// src/core/content-scripts/ContentScriptCore.js
// Critical infrastructure for content script - Firefox compatible version

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

// Factory function that creates an EventTarget with custom methods for Firefox compatibility
export function ContentScriptCore() {
  // Create EventTarget instance
  const eventTarget = new EventTarget();

  // Add custom properties
  eventTarget.initialized = false;
  eventTarget.vueLoaded = false;
  eventTarget.featuresLoaded = false;
  eventTarget.messageHandler = null;
  eventTarget.accessChecked = false;
  eventTarget.access = null;

  // Add custom methods
  eventTarget.initializeCritical = async function() {
    if (this.initialized) {
      return;
    }

    try {
      // Load dependencies first
      await loadDependencies();

      // Check access first
      this.access = checkContentScriptAccess();
      this.accessChecked = true;

      if (!this.access.isAccessible) {
        logger.warn(`Content script execution stopped: ${this.access.errorMessage}`);
        return false;
      }

      // Prevent duplicate execution
      if (window.translateItContentScriptLoaded) {
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
      return true;
    } catch (error) {
      logger.error('Failed to initialize ContentScriptCore:', error);
      return false;
    }
  };

  eventTarget.initializeCore = async function() {
    if (!this.validateExtensionContext('core-initialization')) {
      return;
    }
  };

  eventTarget.initializeMessaging = async function() {
    if (!this.validateExtensionContext('messaging-initialization')) {
      return;
    }

    try {
      this.messageHandler = createMessageHandler();
      await this.registerCoreHandlers();

      if (!this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
      }
    } catch (error) {
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: 'messaging-initialization',
          isSilent: true,
          showToast: false
        });
      }
      logger.error('Failed to initialize messaging:', error);
    }
  };

  eventTarget.registerCoreHandlers = async function() {
    this.messageHandler.registerHandler('contentScriptReady', async () => {
      return { ready: true, vueLoaded: this.vueLoaded, featuresLoaded: this.featuresLoaded };
    });

    this.messageHandler.registerHandler('loadVueApp', async () => {
      await this.loadVueApp();
      return { success: true };
    });

    this.messageHandler.registerHandler('loadFeatures', async () => {
      await this.loadFeatures();
      return { success: true };
    });
  };

  eventTarget.loadVueApp = async function() {
    if (this.vueLoaded) return;

    try {
      logger.info('Loading Vue app lazily...');
      const { loadVueApp } = await import('./chunks/lazy-vue-app.js');
      await loadVueApp(this);

      this.vueLoaded = true;
      this.dispatchEvent(new CustomEvent('vue-loaded'));
      logger.info('Vue app loaded successfully');
    } catch (error) {
      logger.error('Failed to load Vue app:', error);
      await this.fallbackVueLoad();
    }
  };

  eventTarget.loadFeatures = async function() {
    if (this.featuresLoaded) return;

    try {
      logger.info('Loading features lazily...');
      const { loadCoreFeatures } = await import('./chunks/lazy-features.js');
      await loadCoreFeatures();

      this.featuresLoaded = true;
      this.dispatchEvent(new CustomEvent('features-loaded'));
      logger.info('Core features loaded successfully');
    } catch (error) {
      logger.error('Failed to load core features:', error);
      await this.fallbackFeaturesLoad();
    }
  };

  eventTarget.loadFeature = async function(featureName) {
    try {
      const { loadFeatureOnDemand } = await import('./chunks/lazy-features.js');
      return await loadFeatureOnDemand(featureName);
    } catch (error) {
      if (ErrorHandler) {
        const errorHandler = ErrorHandler.getInstance();
        await errorHandler.handle(error, {
          context: `feature-loading-${featureName}`,
          isSilent: true,
          showToast: false
        });
      }
      logger.error(`Failed to load feature ${featureName}:`, error);
      return null;
    }
  };

  eventTarget.getFeature = function(featureName) {
    try {
      const { getFeature } = require('./chunks/lazy-features.js');
      return getFeature(featureName);
    } catch {
      return null;
    }
  };

  eventTarget.fallbackVueLoad = async function() {
    logger.info('Attempting fallback Vue load...');
    const { initializeLegacyHandlers } = await import('./legacy-handlers.js');
    await initializeLegacyHandlers(this);
  };

  eventTarget.fallbackFeaturesLoad = async function() {
    logger.info('Attempting fallback features load...');
    const { FeatureManager } = await import('@/core/managers/content/FeatureManager.js');
    const featureManager = FeatureManager.getInstance();
    await featureManager.initialize();
  };

  eventTarget.injectMainDOMStyles = async function() {
    if (!this.validateExtensionContext('main-dom-css-injection')) {
      return;
    }

    try {
      const existingStyle = document.getElementById('translate-it-main-dom-styles');
      if (existingStyle) {
        const rootStyles = getComputedStyle(document.documentElement);
        const highlightColor = rootStyles.getPropertyValue('--translate-highlight-color');
        if (highlightColor && highlightColor.trim() !== '') {
          return;
        }
        existingStyle.remove();
      }

      if (mainDomCss && mainDomCss.includes('translate-it-element-highlighted')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'translate-it-main-dom-styles';
        styleElement.textContent = mainDomCss;
        document.head.appendChild(styleElement);
      }
    } catch (error) {
      logger.error('Failed to inject Main DOM CSS:', error);
    }
  };

  eventTarget.validateExtensionContext = function() {
    if (!ExtensionContextManager || !ExtensionContextManager.isValidSync()) {
      return false;
    }
    return true;
  };

  eventTarget.isInIframe = function() {
    return window !== window.top;
  };

  eventTarget.isAccessible = function() {
    return this.accessChecked && this.access.isAccessible;
  };

  eventTarget.isVueLoaded = function() {
    return this.vueLoaded;
  };

  eventTarget.areFeaturesLoaded = function() {
    return this.featuresLoaded;
  };

  eventTarget.getMessageHandler = function() {
    return this.messageHandler;
  };

  eventTarget.cleanup = function() {
    if (this.messageHandler) {
      this.messageHandler.cleanup();
    }
    this.vueLoaded = false;
    this.featuresLoaded = false;
    this.initialized = false;
    if (logger) {
      logger.info('ContentScriptCore cleaned up');
    }
  };

  // Keep the initialize method for backward compatibility
  eventTarget.initialize = async function() {
    return await this.initializeCritical();
  };

  return eventTarget;
}

// Export the function for static import usage
export default ContentScriptCore;