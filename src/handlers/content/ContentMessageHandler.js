import { MessageActions } from '@/shared/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/shared/messaging/core/MessagingCore.js';
import { TranslationMode } from '@/shared/config/config.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { revertHandler } from './RevertHandler.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { pageEventBus } from '@/core/PageEventBus.js';
import ResourceTracker from '@/core/memory/ResourceTracker.js';
import { createMessageHandler } from '@/shared/messaging/core/MessageHandler.js';

// Singleton instance for ContentMessageHandler
let contentMessageHandlerInstance = null;

export class ContentMessageHandler extends ResourceTracker {
  constructor(options = {}) {
    super('content-message-handler')

    // Enforce singleton pattern
    if (contentMessageHandlerInstance) {
      const tempLogger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'ContentMessageHandler');
      tempLogger.debug('ContentMessageHandler singleton already exists, returning existing instance');
      return contentMessageHandlerInstance;
    }

    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MessageHandler');
    this.selectElementManager = null;
    this.iFrameManager = null;
    this.errorHandler = ErrorHandler.getInstance();

    // Store singleton instance
    contentMessageHandlerInstance = this;
    this.logger.debug('ContentMessageHandler singleton created');

    // CRITICAL: Protect ContentMessageHandler itself from Memory Garbage Collector
    this.trackResource('content-message-handler-core', () => {
      this.logger.debug('ContentMessageHandler core cleanup called - PROTECTED (critical resource)');
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
      this.logger.debug('ContentMessageHandler already active');
      return true;
    }
    
    try {
      this.initialize();
      
      // Connect to message handler for smart feature management
      this.messageHandler = createMessageHandler();
      
      // Register all handlers with the central message handler
      for (const [action, handler] of this.handlers.entries()) {
        this.messageHandler.registerHandler(action, async (message, sender) => {
          try {
            const result = await handler.call(this, message, sender);
            return result;
          } catch (error) {
            this.logger.error(`Error in content handler for ${action}:`, error);
            throw error;
          }
        });
      }
      
      // Activate the message listener
      if (!this.messageHandler.isListenerActive) {
        this.messageHandler.listen();
        this.logger.debug('ContentMessageHandler message listener activated');
      }
      
      // Track message handler for cleanup - CRITICAL: Must survive memory cleanup
      this.trackResource('messageHandler', () => {
        this.logger.debug('ContentMessageHandler messageHandler cleanup called - BUT SKIPPED DUE TO CRITICAL PROTECTION');
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
      this.logger.debug('ContentMessageHandler not active');
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
      this.logger.debug(`Handler unregistered for action: ${action}`);
    }
  }

  unregisterAllHandlers() {
    this.handlers.clear();
    this.logger.debug('All handlers unregistered');
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
    this.logger.debug(`No handler for action: ${message.action}`);
    return false; // Message not handled
  }

  async handleActivateSelectElementMode(message) {
    this.logger.debug(`[ContentMessageHandler] handleActivateSelectElementMode called for tab: ${message.data?.tabId || 'current'}`);
    this.logger.operation("ContentMessageHandler: ACTIVATE_SELECT_ELEMENT_MODE received!", {
      hasSelectElementManager: !!this.selectElementManager,
      messageData: message.data,
      isInIframe: window !== window.top,
      frameLocation: window.location.href,
      messageAction: message.action,
      messageSource: message.source,
      isActive: this.isActive,
      hasMessageHandler: !!this.messageHandler,
      initialized: this.initialized
    });

    try {
      if (!this.selectElementManager) {
        throw new Error('SelectElementManager not available - FeatureManager dependency injection may have failed');
      }

      this.logger.debug("ContentMessageHandler: Activating SelectElementManager directly");

      // Initialize if not already initialized
      if (!this.selectElementManager.isInitialized) {
        await this.selectElementManager.initialize();
      }

      // Activate Select Element mode
      const result = await this.selectElementManager.activateSelectElementMode();
      this.logger.debug("ContentMessageHandler: SelectElementManager.activateSelectElementMode() completed");

      // Return success result
      return { success: true, activated: result.isActive, managerId: result.instanceId };
      
    } catch (error) {
      this.logger.error("ContentMessageHandler: SelectElement activation failed:", error);
      
      // Use centralized error handling for better error classification
      const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
      const { ErrorTypes } = await import('@/shared/error-management/ErrorTypes.js');
      const errorHandler = ErrorHandler.getInstance();
      
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
      const excludeFrameId = message?.data?.excludeFrameId;
      
      // Check if this is an explicit deactivation request
      const isExplicitDeactivation = message?.data?.isExplicitDeactivation;

      // Only process deactivation if it's explicit or from non-background sources
      if (fromBackground && !isExplicitDeactivation) {
        this.logger.debug('Ignoring implicit deactivation from background', {
          fromBackground,
          isExplicitDeactivation
        });
        return { success: true, activated: this.selectElementManager ? this.selectElementManager.isSelectElementActive() : false };
      }

      this.logger.debug('DEACTIVATE_SELECT_ELEMENT_MODE received', {
        fromBackground: fromBackground,
        excludeFrameId: excludeFrameId,
        isActive: this.selectElementManager ? this.selectElementManager.isSelectElementActive() : false,
        isInIframe: window !== window.top,
      });

      try {
        // Deactivate the manager directly
        await this.selectElementManager.deactivate({ fromBackground });

        return { success: true, activated: false };
      } catch (error) {
        this.logger.error("ContentMessageHandler: selectElementManager deactivation failed:", error);
        return { success: false, error: error.message };
      }
    } else {
      this.logger.debug("ContentMessageHandler: Deactivate request received but selectElementManager is null - this is normal if not activated");
      return { success: true, activated: false };
    }
  }

  async handleStreamUpdate(message) {
    this.logger.debug('[ContentMessageHandler] Received TRANSLATION_STREAM_UPDATE:', {
      messageId: message.messageId,
      success: message.data?.success,
      batchIndex: message.data?.batchIndex,
      hasSelectElementManager: !!this.selectElementManager,
      isActive: this.selectElementManager?.isSelectElementActive()
    });

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
    this.logger.debug(`Handling translation result for mode: ${translationMode}`, {
      success,
      translatedTextLength: translatedText?.length,
      originalTextLength: originalText?.length,
      hasToastId: !!toastId,
      hasError: !!error,
      errorType: typeof error
    });

    switch (translationMode) {
      case TranslationMode.Select_Element:
      case 'SelectElement': // Handle both enum and hardcoded string for robustness
        if (this.selectElementManager) {
          this.logger.debug('Forwarding to SelectElementHandler');
          return this.selectElementManager.handleTranslationResult(message);
        }
        break;

      case TranslationMode.Field:
      case 'field': // Handle both enum and string for robustness
        this.logger.debug('Processing Text Field translation result');
        
        // Check if translation failed at background level
        if (success === false && error) {
          this.logger.debug('Text Field translation failed in background, handling error');
          
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
          await this.errorHandler.handle(translationError, {
            context: 'text-field-translation',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          });
          
          translationError.alreadyHandled = true;
          throw translationError;
        }
        
        // If success or no explicit error, proceed with normal flow
        this.logger.debug('Forwarding result to applyTranslationToTextField');
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
          await this.errorHandler.handle(error, {
            context: 'text-field-application',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          });
          
          error.alreadyHandled = true;
          throw error;
        }

      case TranslationMode.Selection:
      case TranslationMode.Dictionary_Translation:
        this.logger.debug(`Displaying result for ${translationMode} mode in notification.`);
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
    this.logger.debug('Handling revertTranslation action');
    return await revertHandler.executeRevert();
  }

  // IFrame support handlers
  async handleIFrameActivateSelectElement(data) {
    this.logger.debug('IFrame activate select element request', data);
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
    this.logger.debug('IFrame translate selection request', data);
    // Delegate to WindowsManager through page event bus
    pageEventBus.emit('iframe-translate-selection', data);
    return { success: true };
  }

  async handleIFrameGetFrameInfo(data) {
    this.logger.debug('IFrame get frame info request', data);
    if (this.iFrameManager) {
      return { 
        success: true, 
        frameInfo: this.iFrameManager.getFrameInfo() 
      };
    }
    return { success: false, error: 'IFrameManager not available' };
  }

  async handleIFrameCoordinateOperation(data) {
    this.logger.debug('IFrame coordinate operation request', data);
    // Delegate to appropriate manager based on operation type
    if (data.operation === 'select-element' && this.selectElementManager) {
      return await this.handleIFrameActivateSelectElement(data);
    }
    return { success: false, error: 'Unsupported operation or manager not available' };
  }

  async handleIFrameDetectTextFields(data) {
    this.logger.debug('IFrame detect text fields request', data);
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
    this.logger.debug('IFrame insert text request', data);
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

  async handleIFrameSyncRequest(data) {
    this.logger.debug('IFrame sync request', data);
    if (this.iFrameManager) {
      // Handle synchronization requests
      return { success: true, response: 'sync-acknowledged' };
    }
    return { success: false, error: 'IFrameManager not available' };
  }

  async handleIFrameSyncResponse(data) {
    this.logger.debug('IFrame sync response', data);
    // Handle sync response - could be used for coordination
    return { success: true };
  }

  async cleanup() {
    this.handlers.clear();
    this.selectElementManager = null;
    this.iFrameManager = null;

    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();

    this.logger.debug('ContentMessageHandler cleanup completed');
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
// Note: This creates the singleton instance when first accessed
let _contentMessageHandlerInstance = null;
export const contentMessageHandler = new Proxy({}, {
  get: function(target, prop) {
    if (!_contentMessageHandlerInstance) {
      _contentMessageHandlerInstance = ContentMessageHandler.getInstance();
    }
    return _contentMessageHandlerInstance[prop];
  }
});
