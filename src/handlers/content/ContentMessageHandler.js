import { MessageActions } from '@/messaging/core/MessageActions.js';
import { MessagingContexts } from '@/messaging/core/MessagingCore.js';
import { TranslationMode } from '../../config.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { RevertHandler } from './RevertHandler.js';
import { applyTranslationToTextField } from '../smartTranslationIntegration.js';
import { ErrorHandler } from '@/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/error-management/ErrorTypes.js';
import { pageEventBus } from '@/utils/core/PageEventBus.js';

export class ContentMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.initialized = false;
    this.context = MessagingContexts.CONTENT;
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'MessageHandler');
    this.selectElementManager = null;
    this.errorHandler = ErrorHandler.getInstance();
  }

  setSelectElementManager(manager) {
    this.selectElementManager = manager;
  }

  initialize() {
    if (this.initialized) return;
    this.registerHandlers();
    this.initialized = true;
    this.logger.init('Content message handler initialized');
  }

  registerHandlers() {
    this.registerHandler(MessageActions.ACTIVATE_SELECT_ELEMENT_MODE, this.handleActivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.DEACTIVATE_SELECT_ELEMENT_MODE, this.handleDeactivateSelectElementMode.bind(this));
    this.registerHandler(MessageActions.TRANSLATION_RESULT_UPDATE, this.handleTranslationResult.bind(this));
    this.registerHandler(MessageActions.REVERT_SELECT_ELEMENT_MODE, this.handleRevertTranslation.bind(this));
  }

  registerHandler(action, handler) {
    if (this.handlers.has(action)) {
      this.logger.warn(`Overwriting handler for action: ${action}`);
    }
    this.handlers.set(action, handler);
  }

  async handleMessage(message, sender, sendResponse) {
    const handler = this.handlers.get(message.action);
    if (handler) {
      try {
        const result = await handler(message, sender);
        if (sendResponse) sendResponse({ success: true, data: result });
        return true; // Message was handled
      } catch (error) {
        // Don't log errors that are already handled
        if (!error.alreadyHandled) {
          this.logger.error(`Error handling ${message.action}`, error);
        }
        if (sendResponse) sendResponse({ success: false, error: error.message });
        return true; // Error was handled
      }
    }
    return false; // Message not handled
  }

  async handleActivateSelectElementMode(message) {
    if (this.selectElementManager) {
      return this.selectElementManager.activate();
    }
  }

  async handleDeactivateSelectElementMode(message) {
    if (this.selectElementManager) {
      return this.selectElementManager.deactivate();
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
    const revertHandler = new RevertHandler();
    return await revertHandler.executeRevert();
  }
}

export const contentMessageHandler = new ContentMessageHandler();
