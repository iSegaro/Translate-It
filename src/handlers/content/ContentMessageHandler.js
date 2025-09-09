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

export class ContentMessageHandler extends ResourceTracker {
  constructor() {
    super('content-message-handler')
    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MessageHandler');
    this.selectElementManager = null;
    this.iFrameManager = null;
    this.errorHandler = ErrorHandler.getInstance();
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
      this.isActive = true;
      this.logger.info('ContentMessageHandler activated successfully');
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
    this.logger.operation("🎯 ContentMessageHandler: ACTIVATE_SELECT_ELEMENT_MODE received!", {
      hasSelectElementManager: !!this.selectElementManager,
      messageData: message.data,
      isInIframe: window !== window.top,
      frameLocation: window.location.href
    });
    
    if (this.selectElementManager) {
      this.logger.info("🚀 ContentMessageHandler: Calling selectElementManager.activate()");
      this.logger.debug("🔍 SelectElementManager debug info:", {
        hasActivateMethod: typeof this.selectElementManager.activate === 'function',
        constructorName: this.selectElementManager.constructor.name,
        keys: Object.keys(this.selectElementManager),
        isActive: this.selectElementManager.isActive
      });
      
      try {
        await this.selectElementManager.activate();
        
        this.logger.info("✅ ContentMessageHandler: selectElementManager.activate() completed successfully");
        
        // Always return a proper success response
        return { success: true, activated: true };
      } catch (error) {
        this.logger.error("❌ ContentMessageHandler: selectElementManager.activate() failed:", error);
        return { success: false, error: error.message, activated: false };
      }
    } else {
      this.logger.error("❌ ContentMessageHandler: No selectElementManager available!");
      return { success: false, error: "SelectElementManager not available", activated: false };
    }
  }

  async handleDeactivateSelectElementMode(message) {
    if (this.selectElementManager) {
      // Check if this is from background (to avoid circular messaging)
      const fromBackground = message?.data?.fromBackground;
      this.logger.debug('DEACTIVATE_SELECT_ELEMENT_MODE received', {
        fromBackground: fromBackground,
        isActive: this.selectElementManager.isActive,
        isInIframe: window !== window.top,
      });
      
      try {
        if (fromBackground) {
          // Use forceDeactivate to avoid sending back to background
          this.logger.debug('Using forceDeactivate (background-initiated)');
          await this.selectElementManager.forceDeactivate();
        } else {
          this.logger.debug('Using regular deactivate (local-initiated)');
          await this.selectElementManager.deactivate();
        }
        
        return { success: true, activated: false };
      } catch (error) {
        this.logger.error("❌ ContentMessageHandler: selectElementManager deactivation failed:", error);
        return { success: false, error: error.message };
      }
    } else {
      this.logger.warn("❌ ContentMessageHandler: No selectElementManager available for deactivation!");
      return { success: false, error: "SelectElementManager not available" };
    }
  }

  async handleStreamUpdate(message) {
    this.logger.debug('[ContentMessageHandler] Received TRANSLATION_STREAM_UPDATE:', { 
      messageId: message.messageId, 
      success: message.data?.success,
      batchIndex: message.data?.batchIndex,
      hasSelectElementManager: !!this.selectElementManager 
    });
    
    if (this.selectElementManager) {
      return this.selectElementManager.translationOrchestrator.handleStreamUpdate(message);
    } else {
      this.logger.warn('[ContentMessageHandler] No selectElementManager available for stream update');
    }
  }

  async handleStreamEnd(message) {
    if (this.selectElementManager) {
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
          this.logger.debug('Forwarding to SelectElementManager');
          return this.selectElementManager.handleTranslationResult(message);
        }
        break;

      case TranslationMode.Field:
        this.logger.debug('Processing Text Field translation result');
        
        // Check if translation failed at background level
        if (success === false && error) {
          this.logger.debug('Text Field translation failed in background, handling error');
          
          // Dismiss status notification if exists
          if (toastId) {
            pageEventBus.emit('dismiss_notification', { id: toastId });
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
            } catch (jsonError) {
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
          return await applyTranslationToTextField(translatedText, originalText, translationMode, toastId);
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
      await this.selectElementManager.activate();
      return { success: true };
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
}

export const contentMessageHandler = new ContentMessageHandler();
