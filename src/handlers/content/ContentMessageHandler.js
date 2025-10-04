import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { revertHandler } from './RevertHandler.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';
// ErrorHandler will be imported dynamically when needed
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
// createMessageHandler will be imported dynamically when needed

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

    // Initialize error handler lazily when needed
    this._errorHandler = null;

    // Add getter for errorHandler
    Object.defineProperty(this, 'errorHandler', {
      get: async function() {
        if (!this._errorHandler) {
          try {
            const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
            this._errorHandler = ErrorHandler.getInstance();
          } catch {
            // Fallback: create a simple error handler
            this._errorHandler = {
              handle: (err, context) => {
                console.error('Error:', err, context);
                return err;
              }
            };
          }
        }
        return this._errorHandler;
      },
      configurable: true
    });

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

        // Store reference to message handler
        this.messageHandler = messageHandler;

        this.logger.info(`✅ ContentMessageHandler registered ${this.handlers.size} handlers`);
        // logger.trace('Handler details:', {
        //   hasRevertHandler: this.handlers.has('revertTranslation'),
        //   usingContentScriptCore: !!contentScriptCore
        // });
      } else {
        throw new Error('No valid message handler available');
      }

      // Activate the message listener if we created our own
      if (!contentScriptCore && this.messageHandler && !this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
        this.logger.info('✅ ContentMessageHandler message listener activated');
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
      this.logger.info('🎉 ContentMessageHandler activated successfully with smart message handling');
      return true;
    } catch (error) {
      this.logger.error('❌ Failed to activate ContentMessageHandler:', error);
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

  async handleActivateSelectElementMode(/* message */) {
    // logger.trace(`[ContentMessageHandler] handleActivateSelectElementMode called for tab: ${message.data?.tabId || 'current'}`);
    this.logger.info("ContentMessageHandler: ACTIVATE_SELECT_ELEMENT_MODE received!");

    try {
      if (!this.selectElementManager) {
        throw new Error('SelectElementManager not available - FeatureManager dependency injection may have failed');
      }

      // logger.trace("ContentMessageHandler: Activating SelectElementManager directly");

      // Initialize if not already initialized
      if (!this.selectElementManager.isInitialized) {
        await this.selectElementManager.initialize();
      }

      // Activate Select Element mode
      const result = await this.selectElementManager.activateSelectElementMode();
      this.logger.info("SelectElementManager activated successfully");

      // Return success result
      return { success: true, activated: result.isActive, managerId: result.instanceId };
      
    } catch (error) {
      this.logger.error("ContentMessageHandler: SelectElement activation failed:", error);
      
      // Use centralized error handling for better error classification
      const errorHandler = await this.errorHandler;
      
      // Determine error type and provide meaningful response
      let errorType = ErrorTypes.UNKNOWN;
      let userMessage = "Failed to activate Select Element mode";
      
      // Check for specific error conditions
      if (error.message.includes('Extension context')) {
        errorType = ErrorTypes.CONTEXT;
        userMessage = "Extension context invalidated. Please refresh the page.";
      } else if (error.message.includes('permission') || error.message.includes('restricted')) {
        errorType = ErrorTypes.PERMISSION;
        userMessage = "Feature not available on this page";
      } else if (error.message.includes('initialization') || error.message.includes('initialize')) {
        errorType = ErrorTypes.INTEGRATION;
        userMessage = "Feature initialization failed. Please refresh the page.";
      }
      
      // Log the error with proper context
      await errorHandler.handle(error, {
        type: errorType,
        context: "ContentMessageHandler-activateSelectElement",
        showToast: false // Don't show toast for background-triggered actions
      });
      
      return { 
        success: false, 
        error: userMessage, 
        activated: false,
        errorType: errorType,
        isCompatibilityIssue: true // Explicitly mark as compatibility issue, not restriction
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
        // logger.trace('Ignoring implicit deactivation from background', {
        //   fromBackground,
        //   isExplicitDeactivation
        // });
        return { success: true, activated: this.selectElementManager ? this.selectElementManager.isSelectElementActive() : false };
      }

      this.logger.info('DEACTIVATE_SELECT_ELEMENT_MODE received');

      try {
        // Deactivate the manager directly
        await this.selectElementManager.deactivate({ fromBackground });

        return { success: true, activated: false };
      } catch (error) {
        this.logger.error("ContentMessageHandler: selectElementManager deactivation failed:", error);
        return { success: false, error: error.message };
      }
    } else {
      // logger.trace("ContentMessageHandler: Deactivate request received but selectElementManager is null - this is normal if not activated");
      return { success: true, activated: false };
    }
  }

  async handleStreamUpdate(message) {
    // logger.trace('[ContentMessageHandler] Received TRANSLATION_STREAM_UPDATE:', {
    //   messageId: message.messageId,
    //   success: message.data?.success,
    //   batchIndex: message.data?.batchIndex,
    //   hasSelectElementManager: !!this.selectElementManager,
    //   isActive: this.selectElementManager?.isSelectElementActive()
    // });

    if (this.selectElementManager && this.selectElementManager.translationOrchestrator) {
      return this.selectElementManager.translationOrchestrator.handleStreamUpdate(message);
    } else {
      this.logger.warn('[ContentMessageHandler] SelectElementManager not available for stream update');
    }
  }

  async handleStreamEnd(message) {
    if (this.selectElementManager && this.selectElementManager.translationOrchestrator) {
      return this.selectElementManager.translationOrchestrator.handleStreamEnd(message);
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
      case 'SelectElement': // Handle both enum and hardcoded string for robustness
        if (this.selectElementManager) {
          this.logger.info('Forwarding to SelectElementHandler');
          return this.selectElementManager.handleTranslationResult(message);
        }
        break;

      case TranslationMode.Field:
      case 'field': // Handle both enum and string for robustness
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
          
          // Extract error message safely
          let errorMessage;
          if (typeof error === 'string' && error.length > 0) {
            errorMessage = error;
          } else if (error && typeof error === 'object' && error.message) {
            errorMessage = error.message;
          } else if (error) {
            try {
              errorMessage = JSON.stringify(error);
                        } catch {
              errorMessage = 'Translation failed';
            }
          } else {
            errorMessage = 'Translation failed';
          }
          
          // Create error object with original error message
          const translationError = new Error(errorMessage);
          translationError.originalError = error;
          
          // Use centralized error handling
          const errorHandler = await this.errorHandler;
          await errorHandler.handle(translationError, {
            context: 'text-field-translation',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          });
          
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
          
          // Use centralized error handling
          const errorHandler = await this.errorHandler;
          await errorHandler.handle(error, {
            context: 'text-field-application',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          });
          
          error.alreadyHandled = true;
          throw error;
        }

      case TranslationMode.Selection:
      case TranslationMode.Dictionary_Translation:
        this.logger.info(`Displaying result for ${translationMode} mode in notification.`);
        return true;

      default:
        this.logger.warn(`No handler for translation result mode: ${translationMode}`);
        return false;
    }

    // This part is reached if the 'SelectElement' case is hit but selectElementManager is null
    this.logger.warn(`Handler for ${translationMode} was not properly configured.`);
    return false;
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
    if (data.operation === 'select-element' && this.selectElementManager) {
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

  async cleanup() {
    this.handlers.clear();
    this.selectElementManager = null;
    this.iFrameManager = null;

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
