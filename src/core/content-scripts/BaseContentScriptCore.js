// src/core/content-scripts/BaseContentScriptCore.js
// Base infrastructure for content scripts - Shared by Main and IFrame

// Lazy load common dependencies
let logger = null;
let getScopedLogger = null;
let LOG_COMPONENTS = null;
let checkContentScriptAccess = null;
let ExtensionContextManager = null;
let createMessageHandler = null;

async function loadBaseDependencies() {
  if (logger) return;

  const [
    loggerModule,
    logConstantsModule,
    tabPermissionsModule,
    extensionContextModule,
    messageHandlerModule,
    windowErrorHandlersModule
  ] = await Promise.all([
    import("@/shared/logging/logger.js"),
    import("@/shared/logging/logConstants.js"),
    import("@/core/tabPermissions.js"),
    import('@/core/extensionContext.js'),
    import('@/shared/messaging/core/MessageHandler.js'),
    import('@/shared/error-management/windowErrorHandlers.js')
  ]);

  getScopedLogger = loggerModule.getScopedLogger;
  LOG_COMPONENTS = logConstantsModule.LOG_COMPONENTS;
  checkContentScriptAccess = tabPermissionsModule.checkContentScriptAccess;
  ExtensionContextManager = extensionContextModule.default;
  createMessageHandler = messageHandlerModule.createMessageHandler;
  
  window._translateItWindowErrorHandlersModule = windowErrorHandlersModule;
  logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'BaseContentScriptCore');
}

/**
 * BaseContentScriptCore - Provides shared infrastructure for all frames.
 * Does NOT include Vue or heavy UI logic.
 */
export function BaseContentScriptCore() {
  const eventTarget = new EventTarget();

  eventTarget.initialized = false;
  eventTarget.baseInitialized = false;
  eventTarget._baseInitializationPromise = null;
  eventTarget.messageHandler = null;
  eventTarget.access = null;

  eventTarget.initializeBase = async function() {
    if (this.baseInitialized || this.initialized) return true;
    if (this._baseInitializationPromise) return this._baseInitializationPromise;

    if (window.translateItContentScriptLoaded) return false;

    if (window.translateItContentScriptInitializing) {
      const ownerPromise = window._translateItBootstrapPromise;
      if (ownerPromise) {
        const joined = ownerPromise.then(
          () => false,
          () => false,
        );
        const wrappedJoined = joined.finally(() => {
          if (this._baseInitializationPromise === wrappedJoined) {
            this._baseInitializationPromise = null;
          }
        });
        this._baseInitializationPromise = wrappedJoined;
        return wrappedJoined;
      }
      return false;
    }

    window.translateItContentScriptInitializing = true;

    const initialization = (async () => {
      await loadBaseDependencies();

      this.access = checkContentScriptAccess();
      if (!this.access.isAccessible) {
        if (logger) logger.warn(`Content script blocked: ${this.access.errorMessage}`);
        return false;
      }

      // Initialize error handlers
      const errorModule = window._translateItWindowErrorHandlersModule;
      if (errorModule?.setupWindowErrorHandlers) {
        errorModule.setupWindowErrorHandlers('content');
      }

      // Another content core owns this document.
      if (window.translateItContentScriptLoaded) return false;

      await this.initializeMessaging();
      window.translateItContentScriptLoaded = true;
      this.baseInitialized = true;
      return true;
    })().catch((error) => {
      if (logger) logger.error('Failed to initialize Base Core:', error);
      return false;
    });

    const wrapped = initialization.finally(() => {
      if (window._translateItBootstrapPromise === wrapped) {
        window._translateItBootstrapPromise = null;
        window.translateItContentScriptInitializing = false;
      }
      if (this._baseInitializationPromise === wrapped) {
        this._baseInitializationPromise = null;
      }
    });
    window._translateItBootstrapPromise = wrapped;
    this._baseInitializationPromise = wrapped;
    return wrapped;
  };

  eventTarget.initializeMessaging = async function() {
    if (!ExtensionContextManager?.isValidSync()) {
      throw new Error('Extension context is unavailable for messaging initialization');
    }

    try {
      const { initializeContentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      await initializeContentScriptIntegration();

      this.messageHandler = createMessageHandler();
      if (!this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
      }
    } catch (error) {
      this.messageHandler?.stopListening?.();
      this.messageHandler = null;
      if (logger) logger.error('Failed to initialize messaging:', error);
      throw error;
    }
  };

  eventTarget.injectStyles = function(css, id) {
    if (!css || document.getElementById(id)) return;
    try {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = css;
      document.head.appendChild(style);
    } catch (error) {
      if (logger) logger.error(`Failed to inject styles ${id}:`, error);
    }
  };

  eventTarget.isTopFrame = () => window === window.top;

  return eventTarget;
}

export default BaseContentScriptCore;
