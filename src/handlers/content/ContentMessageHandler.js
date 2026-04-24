import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { revertHandler } from './RevertHandler.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';

// Singleton instance for ContentMessageHandler
let contentMessageHandlerInstance = null;

export class ContentMessageHandler extends ResourceTracker {
  constructor() {
    super('content-message-handler')

    // Enforce singleton pattern
    if (contentMessageHandlerInstance) {
            // logger.trace('ContentMessageHandler singleton already exists, returning existing instance');
      return contentMessageHandlerInstance;
    }

    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'MessageHandler');
    this.selectElementManager = null;
    this.iFrameManager = null;
    this.pageTranslationManager = null;
    this.errorHandler = ErrorHandler.getInstance();

    // Track processed message IDs to prevent duplicates
    this.processedMessageIds = new Set();

    // Store singleton instance
    contentMessageHandlerInstance = this;
    this.logger.info('ContentMessageHandler singleton created');

    // CRITICAL: Protect ContentMessageHandler itself from Memory Garbage Collector
    this.trackResource('content-message-handler-core', () => {
      // logger.trace('ContentMessageHandler core cleanup called - PROTECTED (critical resource)');
      // This callback is invoked but actual cleanup is skipped due to critical protection.
      // This is the expected behavior to preserve essential messaging functionality.
    }, { isCritical: true });
  }

  setSelectElementManager(manager) {
    this.selectElementManager = manager;
  }

  setIFrameManager(manager) {
    this.iFrameManager = manager;
  }

  setPageTranslationManager(manager) {
    this.pageTranslationManager = manager;
  }

  /**
   * Get the translation handler instance
   * @returns {Promise<Object|null>} Translation handler instance
   */
  async getTranslationHandler() {
    try {
      const { getTranslationHandlerInstance } = await import('@/core/InstanceManager.js');
      return getTranslationHandlerInstance();
    } catch (error) {
      this.logger.debug('Error getting translation handler:', error);
      return null;
    }
  }

  initialize() {
    if (this.initialized) return;
    this.registerHandlers();
    this.initialized = true;
    this.logger.init('Content message handler initialized');
  }

  async activate() {
    if (this.initialized) {
      // logger.trace('ContentMessageHandler already active');
      return true;
    }

    try {
      this.initialize();

      // Get the existing message handler from ContentScriptCore
      // ContentScriptCore should be available globally or through window
      let contentScriptCore = null;

      // Try to get ContentScriptCore instance
      if (window.translateItContentCore) {
        contentScriptCore = window.translateItContentCore;
      } else {
        // Fallback: create our own message handler if ContentScriptCore is not available
        this.logger.warn('ContentScriptCore not available, creating own message handler');
        try {
          const { createMessageHandler } = await import('@/shared/messaging/core/MessageHandler.js');
          this.messageHandler = createMessageHandler();
        } catch (error) {
          this.logger.error('Failed to create message handler:', error);
          throw new Error('MessageHandler creation failed');
        }
      }

      // Use ContentScriptCore's message handler if available
      const messageHandler = contentScriptCore ? contentScriptCore.messageHandler : this.messageHandler;

      // Register all handlers with the message handler
      if (messageHandler && typeof messageHandler.registerHandler === 'function') {
        for (const [action, handler] of this.handlers.entries()) {
          messageHandler.registerHandler(action, (message, sender, sendResponse) => {
            try {
              // Call handler and return result directly (preserve Promise nature)
              const result = handler.call(this, message, sender, sendResponse);
              return result;
            } catch (error) {
              this.logger.error(`Error in content handler for ${action}:`, error);
              throw error;
            }
          });
        }

        // Register DebugModeBridge handlers
        try {
          const { debugModeBridge } = await import('@/shared/logging/DebugModeBridge.js');
          const debugHandlers = debugModeBridge.getHandlerMappings();
          for (const [action, handler] of Object.entries(debugHandlers)) {
            messageHandler.registerHandler(action, handler);
          }
          this.logger.info('Registered DebugModeBridge handlers');
        } catch (error) {
          this.logger.warn('Failed to register DebugModeBridge handlers:', error);
        }

        // Store reference to message handler
        this.messageHandler = messageHandler;

        this.logger.info(`ContentMessageHandler registered ${this.handlers.size} handlers`);
      } else {
        throw new Error('No valid message handler available');
      }

      // Activate the message listener if we created our own
      if (!contentScriptCore && this.messageHandler && !this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
        this.logger.info('ContentMessageHandler message listener activated');
      }

      // If using ContentScriptCore's message handler, it should already be listening
      if (contentScriptCore) {
        // logger.trace('Using ContentScriptCore message listener');
      }

      // Track message handler for cleanup - CRITICAL: Must survive memory cleanup
      this.trackResource('messageHandler', () => {
        // logger.trace('ContentMessageHandler messageHandler cleanup called - BUT SKIPPED DUE TO CRITICAL PROTECTION');
        // This callback is called but the actual cleanup is skipped by MemoryManager
        // because this resource is marked as critical. This is the expected behavior.
        this.logger.debug('Message handler is protected from cleanup and remains active');
      }, { isCritical: true });

      this.isActive = true;
      this.logger.info('ContentMessageHandler activated successfully with smart message handling');
      return true;
    } catch (error) {
      this.logger.error('Failed to activate ContentMessageHandler:', error);
      return false;
    }
  }

  async deactivate() {
    if (!this.initialized) {
      // logger.trace('ContentMessageHandler not active');
      return true;
    }

    try {
      // Unregister all handlers to prevent duplicate registrations
      this.unregisterAllHandlers();

      // Cleanup will handle message handler through ResourceTracker
      this.cleanup();
      this.isActive = false;
      this.logger.info('ContentMessageHandler deactivated successfully');
      return true;
    } catch (error) {
      this.logger.error('Failed to deactivate ContentMessageHandler:', error);
      return false;
    }
  }

  registerHandlers() {
    this.registerHandler(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, this.handleActivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE, this.handleDeactivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.TRANSLATION_RESULT_UPDATE, this.handleTranslationResult.bind(this));
    this.registerHandler(MessageActions.REVERT_SELECT_ELEMENT_MODE, this.handleRevertTranslation.bind(this));

    // Streaming translation handlers - delegate to ContentScriptIntegration
    this.registerHandler(MessageActions.TRANSLATION_STREAM_UPDATE, this.handleStreamUpdate.bind(this));
    this.registerHandler(MessageActions.TRANSLATION_STREAM_END, this.handleStreamEnd.bind(this));

    // IFrame support handlers
    this.registerHandler(MessageActions.IFRAME_ACTIVATE_SELECT_ELEMENT, this.handleIFrameActivateSelectElement.bind(this));
    this.registerHandler(MessageActions.IFRAME_TRANSLATE_SELECTION, this.handleIFrameTranslateSelection.bind(this));
    this.registerHandler(MessageActions.IFRAME_GET_FRAME_INFO, this.handleIFrameGetFrameInfo.bind(this));
    this.registerHandler(MessageActions.IFRAME_COORDINATE_OPERATION, this.handleIFrameCoordinateOperation.bind(this));
    this.registerHandler(MessageActions.IFRAME_DETECT_TEXT_FIELDS, this.handleIFrameDetectTextFields.bind(this));
    this.registerHandler(MessageActions.IFRAME_INSERT_TEXT, this.handleIFrameInsertText.bind(this));
    this.registerHandler(MessageActions.IFRAME_SYNC_REQUEST, this.handleIFrameSyncRequest.bind(this));
    this.registerHandler(MessageActions.IFRAME_SYNC_RESPONSE, this.handleIFrameSyncResponse.bind(this));

    // Page translation handlers
    this.registerHandler(MessageActions.PAGE_TRANSLATE, this.handlePageTranslate.bind(this));
    this.registerHandler(MessageActions.PAGE_RESTORE, this.handlePageRestore.bind(this));
    this.registerHandler(MessageActions.PAGE_TRANSLATE_GET_STATUS, this.handlePageGetStatus.bind(this));
    this.registerHandler(MessageActions.PAGE_TRANSLATE_STOP_AUTO, this.handlePageStopAuto.bind(this));
  }

  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      this.logger.warn(`Overwriting handler for action: ${action}`);
    }
    this.handlers.set(action, handler);
  }

  unregisterHandler(action) {
    if (this.handlers.has(action)) {
      this.handlers.delete(action);
      // logger.trace(`Handler unregistered for action: ${action}`);
    }
  }

  unregisterAllHandlers() {
    this.handlers.clear();
    // logger.trace('All handlers unregistered');
  }

  async handleMessage(message, sender, sendResponse) {
    this.logger.debug(`Handling message: ${message.action}`);
    const handler = this.handlers.get(message.action);
    if (handler) {
      try {
        const result = await handler(message, sender);
        try {
          if (sendResponse) sendResponse({ success: true, data: result });
        } catch (e) {
          this.logger.error(`Failed to send response for ${message.action}:`, e);
        }
        return true; // Message was handled
      } catch (error) {
        // Don't log errors that are already handled
        if (!error.alreadyHandled) {
          this.logger.error(`Error handling ${message.action}`, error);
        }
        try {
          if (sendResponse) sendResponse({ success: false, error: error.message });
        } catch (e) {
          this.logger.error(`Failed to send error response for ${message.action}:`, e);
        }
        return true; // Error was handled
      }
    }
    // logger.trace(`No handler for action: ${message.action}`);
    return false; // Message not handled
  }

  async handleActivateSelectElementMode(message) {
    this.logger.info("ContentMessageHandler: ACTIVATE_SELECT_ELEMENT_MODE received!");

    try {
      // 1. Explicitly check if allowed NOW (in case settings changed after load)
      const { ExclusionChecker } = await import('@/features/exclusion/core/ExclusionChecker.js');
      const exclusionChecker = ExclusionChecker.getInstance();
      const isAllowed = await exclusionChecker.isFeatureAllowed('selectElement');
      
      if (!isAllowed) {
        this.logger.debug('Select Element mode activation blocked by page exclusion or settings');
        return { success: false, error: 'Feature blocked on this page' };
      }

      // 2. If SelectElementManager is not available, try to load the feature on-demand
      if (!this.selectElementManager) {
        try {
          // Import and load the selectElement feature directly
          const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
          const selectElementHandler = await loadFeature('selectElement');

          if (selectElementHandler) {
            this.setSelectElementManager(selectElementHandler);
          } else {
            // This happens if the feature is blocked by exclusion (returns null)
            this.logger.debug('Select Element mode activation blocked by page exclusion or settings');
            return { success: false, error: 'Feature blocked on this page' };
          }
        } catch (loadError) {
          this.logger.info('Failed to load SelectElement feature on-demand:', loadError);
          return { success: false, error: 'Feature failed to load' };
        }
      }

      // Initialize if not already initialized
      if (!this.selectElementManager.isInitialized) {
        await this.selectElementManager.initialize();
      }

      // Activate Select Element mode
      const result = await this.selectElementManager.activateSelectElementMode(message.data || {});
      this.logger.info("SelectElementManager activation process completed");

      // Return success result
      return { 
        success: result !== false, 
        activated: result?.isActive ?? (result !== false), 
        managerId: result?.instanceId 
      };
      
    } catch (error) {
      this.logger.warn("ContentMessageHandler: SelectElement activation failed:", error);
      
      // Use centralized error management to get classified error type and localized message
      const errorInfo = await this.errorHandler.getErrorForUI(error, "ContentMessageHandler-activateSelectElement");

      // Log as debug for internal tracking (silence red log)
      this.logger.debug("Error details for SelectElement activation:", { error, errorInfo });
      
      return { 
        success: false, 
        error: errorInfo.message, 
        activated: false,
        errorType: errorInfo.type
      };
    }
  }

  async handleDeactivateSelectElementMode(message) {
    if (this.selectElementManager) {
      // Check if this is from background (to avoid circular messaging)
      const fromBackground = message?.data?.fromBackground;
            
      // Check if this is an explicit deactivation request
      const isExplicitDeactivation = message?.data?.isExplicitDeactivation;

      // Only process deactivation if it's explicit or from non-background sources
      if (fromBackground && !isExplicitDeactivation) {
        return { success: true, activated: this.selectElementManager ? this.selectElementManager.isSelectElementActive() : false };
      }

      this.logger.info('DEACTIVATE_SELECT_ELEMENT_MODE received');

      try {
        // Deactivate the manager directly
        await this.selectElementManager.deactivate({ fromBackground });

        return { success: true, activated: false };
      } catch (error) {
        this.logger.warn("ContentMessageHandler: selectElementManager deactivation failed:", error);
        return { success: false, error: error.message };
      }
    } else {
      return { success: true, activated: false };
    }
  }

  async handleStreamUpdate(message) {
    // Delegate to ContentScriptIntegration's streaming handler
    try {
      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      return contentScriptIntegration.streamingHandler.handleMessage(message);
    } catch (error) {
      this.logger.error('Failed to delegate stream update to ContentScriptIntegration:', error);
      return false;
    }
  }

  async handleStreamEnd(message) {
    // Delegate to ContentScriptIntegration's streaming handler
    try {
      const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
      return contentScriptIntegration.streamingHandler.handleMessage(message);
    } catch (error) {
      this.logger.error('Failed to delegate stream end to ContentScriptIntegration:', error);
      return false;
    }
  }

  async handleTranslationResult(message) {
    const { translationMode, translatedText, originalText, options, success, error } = message.data;
    const toastId = options?.toastId;
    this.logger.info(`Handling translation result for mode: ${translationMode}`, {
      success,
      translatedTextLength: translatedText?.length,
      originalTextLength: originalText?.length,
      hasToastId: !!toastId,
      hasError: !!error
    });

    switch (translationMode) {
      case TranslationMode.Select_Element:
      case TranslationMode.LEGACY_SELECT_ELEMENT: // Handle both enum and legacy string for robustness
        this.logger.info('Forwarding to StreamingHandler via ContentScriptIntegration');
        try {
          const { contentScriptIntegration } = await import('@/shared/messaging/core/ContentScriptIntegration.js');
          return contentScriptIntegration.streamingHandler.handleMessage(message);
        } catch (error) {
          this.logger.error('Failed to delegate translation result to ContentScriptIntegration:', error);
          return false;
        }

      case TranslationMode.Field:
      case TranslationMode.LEGACY_FIELD: // Handle both enum and legacy string for robustness
        this.logger.info('Processing Text Field translation result');
        
        // Check if translation failed at background level
        if (success === false && error) {
          // logger.trace('Text Field translation failed in background, handling error');
          
          // Dismiss status notification if exists
          if (toastId) {
            pageEventBus.emit('dismiss_notification', { id: toastId });
          }
          // Also clear any globally stored toast ID
          if (window.pendingTranslationToastId) {
            pageEventBus.emit('dismiss_notification', { id: window.pendingTranslationToastId });
            window.pendingTranslationToastId = null;
          }
          
          // Use centralized error handling system to get localized message and correct type
          const errorInfo = await this.errorHandler.getErrorForUI(error, 'text-field-translation');
          
          // Log the error with proper context
          await this.errorHandler.handle(error, {
            context: 'text-field-translation',
            type: errorInfo.type,
            showToast: true
          });
          
          const translationError = new Error(errorInfo.message);
          translationError.type = errorInfo.type;
          translationError.alreadyHandled = true;
          throw translationError;
        }
        
        // If success or no explicit error, proceed with normal flow
        this.logger.info('Forwarding result to applyTranslationToTextField');
        try {
          return await applyTranslationToTextField(translatedText, originalText, translationMode, toastId, message.messageId);
        } catch (error) {
          // Don't handle errors that are already handled
          if (error.alreadyHandled) {
            throw error;
          }
          
          // Only log if error is not already handled
          this.logger.error('Field translation failed during application:', error);
          
          // Use centralized error handling system
          const errorInfo = await this.errorHandler.getErrorForUI(error, 'text-field-application');
          
          await this.errorHandler.handle(error, {
            context: 'text-field-application',
            type: errorInfo.type,
            showToast: true
          });
          
          error.alreadyHandled = true;
          throw error;
        }

      case TranslationMode.Selection:
      case TranslationMode.Dictionary_Translation:
        this.logger.info(`Displaying result for ${translationMode} mode in notification.`);
        return true;

      case TranslationMode.Page:
        // Page translation results are handled directly by PageTranslationBatcher
        // as a direct response to the batch message. We ignore broadcasts here.
        this.logger.debug('Ignoring broadcasted page translation result (already handled by Batcher)');
        return true;

      default:
        this.logger.warn(`No handler for translation result mode: ${translationMode}`);
        return false;
    }
  }

  async handleRevertTranslation() {
    this.logger.info('Handling revert translation request');

    try {
      // Use the existing revertHandler to execute revert
      const result = await revertHandler.executeRevert();
      this.logger.info('Revert completed successfully');
      return result;
    } catch (error) {
      this.logger.error('Revert failed:', error);
      return { success: false, error: error.message };
    }
  }

  // IFrame support handlers
  async handleIFrameActivateSelectElement(/* data */) {
    this.logger.info('IFrame activate select element request');
    if (this.selectElementManager) {
      // Initialize if not already initialized
      if (!this.selectElementManager.isInitialized) {
        await this.selectElementManager.initialize();
      }

      const result = await this.selectElementManager.activateSelectElementMode();
      return { success: true, activated: result.isActive, managerId: result.instanceId };
    }
    return { success: false, error: 'SelectElementManager not available' };
  }

  async handleIFrameTranslateSelection(data) {
    this.logger.info('IFrame translate selection request');
    // Delegate to WindowsManager through page event bus
    pageEventBus.emit('iframe-translate-selection', data);
    return { success: true };
  }

  async handleIFrameGetFrameInfo(/* data */) {
    this.logger.info('IFrame get frame info request');
    if (this.iFrameManager) {
      return { 
        success: true, 
        frameInfo: this.iFrameManager.getFrameInfo() 
      };
    }
    return { success: false, error: 'IFrameManager not available' };
  }

  async handleIFrameCoordinateOperation(data) {
    this.logger.info('IFrame coordinate operation request');
    // Delegate to appropriate manager based on operation type
    if (data.operation === TranslationMode.Select_Element && this.selectElementManager) {
      return await this.handleIFrameActivateSelectElement(data);
    }
    return { success: false, error: 'Unsupported operation or manager not available' };
  }

  async handleIFrameDetectTextFields(/* data */) {
    this.logger.info('IFrame detect text fields request');
    // Basic text field detection
    const textFields = document.querySelectorAll('input[type="text"], textarea, input[type="email"], input[type="url"], input[type="search"]');
    const fieldInfo = Array.from(textFields).map(field => ({
      id: field.id || null,
      tagName: field.tagName,
      type: field.type || null,
      placeholder: field.placeholder || null,
      visible: field.offsetWidth > 0 && field.offsetHeight > 0
    }));
    return { success: true, textFields: fieldInfo };
  }

  async handleIFrameInsertText(data) {
    this.logger.info('IFrame insert text request');
    const { targetSelector, text } = data;
    try {
      const element = document.querySelector(targetSelector);
      if (element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA')) {
        element.value = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        return { success: true };
      }
      return { success: false, error: 'Target element not found or not editable' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async handleIFrameSyncRequest(/* data */) {
    this.logger.info('IFrame sync request');
    if (this.iFrameManager) {
      // Handle synchronization requests
      return { success: true, response: 'sync-acknowledged' };
    }
    return { success: false, error: 'IFrameManager not available' };
  }

  async handleIFrameSyncResponse(/* data */) {
    this.logger.info('IFrame sync response');
    // Handle sync response - could be used for coordination
    return { success: true };
  }

  async handlePageTranslate(message) {
    this.logger.info('Page translation request received');

    // Check for cancel flag
    if (message.data?.cancel) {
      if (this.pageTranslationManager) {
        this.pageTranslationManager.cancelTranslation();
        return { success: true, cancelled: true };
      }
      return { success: false, error: 'PageTranslationManager not available' };
    }

    try {
      // Ensure Vue app is loaded so mobileStore can track translation state
      if (window.translateItContentCore && !window.translateItContentCore.vueLoaded) {
        try {
          this.logger.debug('Loading Vue app for page translation state tracking...');
          // Only load Vue app if the method exists (Main frame only)
        if (typeof window.translateItContentCore?.loadVueApp === 'function') {
          await window.translateItContentCore.loadVueApp();
        } else if (process.env.NODE_ENV === 'development') {
          this.logger.debug('Skipping loadVueApp in this context (likely iframe)');
        }
          this.logger.info('Vue app loaded for page translation state tracking');
        } catch (vueError) {
          this.logger.warn('Failed to load Vue app, translation will continue without UI state sync:', vueError);
        }
      } else if (window.translateItContentCore && window.translateItContentCore.vueLoaded) {
        this.logger.debug('Vue app already loaded, ready for state tracking');
      } else {
        this.logger.warn('translateItContentCore not available, UI state sync may not work');
      }

      // If PageTranslationManager is not available, try to load the feature on-demand
      if (!this.pageTranslationManager) {
        try {
          const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
          const manager = await loadFeature('pageTranslation');

          if (manager) {
            this.setPageTranslationManager(manager);
          } else {
            throw new Error('pageTranslation feature failed to load');
          }
        } catch (loadError) {
          throw new Error(`PageTranslationManager not available: ${loadError.message}`);
        }
      }

      // Ensure manager is initialized
      if (!this.pageTranslationManager.isActive) {
        await this.pageTranslationManager.activate();
      }

      // Execute page translation - PASS message.data to support options like { isAuto: true }
      const result = await this.pageTranslationManager.translatePage(message.data || {});

      // Log appropriate message based on whether this is auto-translation (async) or immediate completion
      if (result.isAutoTranslating) {
        this.logger.info('Page translation started (auto-translate mode)', {
          messageId: result.messageId,
          url: result.url
        });
      } else if (result.translatedCount !== undefined || result.totalNodes !== undefined) {
        this.logger.info('Page translation completed', {
          translatedCount: result.translatedCount,
          totalNodes: result.totalNodes
        });
      } else {
        this.logger.info('Page translation initiated', {
          messageId: result.messageId,
          url: result.url
        });
      }

      return result;

    } catch (error) {
      this.logger.error('Page translation failed:', error);

      // Use centralized error handling system
      const errorInfo = await this.errorHandler.getErrorForUI(error, 'page-translation');

      await this.errorHandler.handle(error, {
        type: errorInfo.type,
        context: 'page-translation',
        showToast: true
      });

      return { success: false, error: errorInfo.message, errorType: errorInfo.type };
    }
  }

  async handlePageRestore() {
    this.logger.info('Page restore request received');

    if (!this.pageTranslationManager) {
      return { success: false, error: 'PageTranslationManager not available' };
    }

    try {
      const result = await this.pageTranslationManager.restorePage();

      this.logger.info('Page restore completed', {
        restoredCount: result.restoredCount
      });

      return result;

    } catch (error) {
      this.logger.error('Page restore failed:', error);

      // Use centralized error handling system
      const errorInfo = await this.errorHandler.getErrorForUI(error, 'page-restore');

      await this.errorHandler.handle(error, {
        type: errorInfo.type,
        context: 'page-restore',
        showToast: true
      });

      return { success: false, error: errorInfo.message, errorType: errorInfo.type };
    }
  }

  async handlePageGetStatus() {
    this.logger.debug('Page translation status request received');

    // 1. PRIORITY: If we are in the top frame, use the aggregated status from index-main
    if (window === window.top && typeof window.getGlobalPageTranslationStatus === 'function') {
      const status = window.getGlobalPageTranslationStatus();
      return { ...status, isAggregated: true };
    }

    // 2. FALLBACK: Use local manager status (for iframes or if aggregator is missing)
    if (!this.pageTranslationManager) {
      try {
        const { loadFeature } = await import('@/core/content-scripts/chunks/lazy-features.js');
        const manager = await loadFeature('pageTranslation');
        if (manager) this.setPageTranslationManager(manager);
      } catch { /* ignore and return inactive status */ }
    }

    if (!this.pageTranslationManager) {
      return { 
        success: true, 
        isActive: false, 
        isTranslating: false, 
        isTranslated: false,
        isAutoTranslating: false
      };
    }

    return {
      success: true,
      ...this.pageTranslationManager.getStatus()
    };
  }

  async handlePageStopAuto() {
    this.logger.info('Page stop auto-translation request received');

    if (!this.pageTranslationManager) {
      return { success: false, error: 'PageTranslationManager not available' };
    }

    try {
      const result = await this.pageTranslationManager.stopAutoTranslation();
      return result;
    } catch (error) {
      this.logger.error('Page stop auto failed:', error);
      return { success: false, error: error.message };
    }
  }

  async cleanup() {
    this.handlers.clear();
    this.selectElementManager = null;
    this.iFrameManager = null;
    this.pageTranslationManager = null;

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    // logger.trace('ContentMessageHandler cleanup completed');
  }

  // Static method to get singleton instance
  static getInstance(options = {}) {
    if (!contentMessageHandlerInstance) {
      contentMessageHandlerInstance = new ContentMessageHandler(options);
    }
    return contentMessageHandlerInstance;
  }

  // Method to reset singleton (for testing or cleanup)
  static resetInstance() {
    if (contentMessageHandlerInstance) {
      contentMessageHandlerInstance.cleanup();
      contentMessageHandlerInstance = null;
    }
  }

  // Static cleanup method for global reset
  static cleanupAll() {
    ContentMessageHandler.resetInstance();
  }
}

// Export default instance for backward compatibility
// Note: This uses the same singleton instance as getInstance()
export const contentMessageHandler = new Proxy({}, {
  get: function(target, prop) {
    const instance = ContentMessageHandler.getInstance();
    return instance[prop];
  },
  set: function(target, prop, value) {
    const instance = ContentMessageHandler.getInstance();
    instance[prop] = value;
    return true;
  }
});
