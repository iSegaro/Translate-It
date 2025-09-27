// ErrorHandlingService Service - Centralizes error handling for select element operations

import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
// ErrorHandler will be imported dynamically when needed
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { errorMessages as ErrorMessages } from "@/shared/error-management/ErrorMessages.js";
import ResourceTracker from '@/core/memory/ResourceTracker.js';

export class ErrorHandlingService extends ResourceTracker {
  constructor() {
    super('error-handling-service')
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'ErrorHandlingService');
    // Initialize error handler lazily when needed
    this._errorHandler = null;

    // Add getter for errorHandler
    Object.defineProperty(this, 'errorHandler', {
      get: async function() {
        if (!this._errorHandler) {
          try {
            const { ErrorHandler } = await import('@/shared/error-management/ErrorHandler.js');
            this._errorHandler = ErrorHandler.getInstance();
          } catch (error) {
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
  }

  /**
   * Initialize the error handling service
   */
  async initialize() {
    this.logger.debug('ErrorHandlingService initialized');
  }

  /**
   * Handle errors with appropriate categorization and reporting
   * @param {Error} error - The error to handle
   * @param {Object} options - Additional options for error handling
   * @param {string} options.type - Error type from ErrorTypes
   * @param {string} options.context - Context where error occurred
   * @param {boolean} options.showNotification - Whether to show user notification
   * @param {HTMLElement} options.element - Related element (if any)
   */
  async handle(error, options = {}) {
    const {
      type = ErrorTypes.UNKNOWN,
      context = 'select-element-unknown',
      showNotification = true,
      element = null
    } = options;

    this.logger.error(`Error in ${context}:`, error);

    // Categorize and handle the error appropriately
    try {
      switch (type) {
        case ErrorTypes.NETWORK:
          await this.handleNetworkError(error, context, showNotification);
          break;
        case ErrorTypes.TRANSLATION:
          await this.handleTranslationError(error, context, showNotification, element);
          break;
        case ErrorTypes.UI:
          await this.handleUIError(error, context, showNotification);
          break;
        case ErrorTypes.INTEGRATION:
          await this.handleIntegrationError(error, context, showNotification);
          break;
        case ErrorTypes.CONFIG:
          await this.handleConfigError(error, context, showNotification);
          break;
        default:
          await this.handleUnknownError(error, context, showNotification);
      }
    } catch (handlingError) {
      // If error handling itself fails, log it but don't throw
      this.logger.error('Error handling failed:', handlingError);
    }
  }

  /**
   * Handle network-related errors
   */
  async handleNetworkError(error, context, showNotification) {
    const userMessage = ErrorMessages.NETWORK_ERROR;
    
    // Report to global error handler
    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.NETWORK,
      context: context,
      userMessage: userMessage,
      severity: 'warning'
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'error');
    }
  }

  /**
   * Handle translation-related errors
   */
  async handleTranslationError(error, context, showNotification, element) {
    let userMessage = ErrorMessages.TRANSLATION_FAILED;
    
    // Provide more specific messages for common translation errors
    if (error.message?.includes('timeout')) {
      userMessage = ErrorMessages.TRANSLATION_TIMEOUT;
    } else if (error.message?.includes('quota') || error.message?.includes('limit')) {
      userMessage = ErrorMessages.API_QUOTA_EXCEEDED;
    }

    // Report to global error handler
    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.TRANSLATION,
      context: context,
      userMessage: userMessage,
      severity: 'error',
      element: element
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'error');
    }
  }

  /**
   * Handle UI-related errors
   */
  async handleUIError(error, context, showNotification) {
    const userMessage = ErrorMessages.UI_ERROR;

    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.UI,
      context: context,
      userMessage: userMessage,
      severity: 'warning'
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'warning');
    }
  }

  /**
   * Handle integration errors (between systems)
   */
  async handleIntegrationError(error, context, showNotification) {
    const userMessage = ErrorMessages.INTEGRATION_ERROR;

    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.INTEGRATION,
      context: context,
      userMessage: userMessage,
      severity: 'error'
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'error');
    }
  }

  /**
   * Handle configuration errors
   */
  async handleConfigError(error, context, showNotification) {
    const userMessage = ErrorMessages.CONFIGURATION_ERROR;

    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.CONFIG,
      context: context,
      userMessage: userMessage,
      severity: 'warning'
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'warning');
    }
  }

  /**
   * Handle unknown errors
   */
  async handleUnknownError(error, context, showNotification) {
    const userMessage = ErrorMessages.UNEXPECTED_ERROR;

    const errorHandler = await this.errorHandler;
    await errorHandler.handle(error, {
      type: ErrorTypes.UNKNOWN,
      context: context,
      userMessage: userMessage,
      severity: 'error'
    });

    if (showNotification) {
      await this.showNotification(userMessage, 'error');
    }
  }

  /**
   * Show user notification for errors
   * @param {string} message - Notification message
   * @param {string} type - Notification type ('error', 'warning', 'info')
   */
  async showNotification(message, type = 'error') {
    try {
      const { pageEventBus } = await import('@/core/PageEventBus.js');
      pageEventBus.emit('show-notification', {
        message,
        type,
        duration: 4000,
      });
    } catch (notificationError) {
      this.logger.warn('Failed to show notification:', notificationError);
      // Fallback to console log if notifications fail
      this.logger.error(`${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * Create a user-friendly error message from technical error
   * @param {Error} error - Technical error
   * @returns {string} User-friendly message
   */
  createUserFriendlyMessage(error) {
    const message = error.message || 'An unknown error occurred';
    
    // Map common technical errors to user-friendly messages
    const errorMappings = {
      'network': 'Network connection failed. Please check your internet connection.',
      'timeout': 'The operation took too long. Please try again.',
      'quota': 'Translation limit exceeded. Please try again later.',
      'failed to fetch': 'Network error. Please check your connection.',
      'invalid response': 'Server returned an invalid response. Please try again.'
    };

    for (const [key, friendlyMessage] of Object.entries(errorMappings)) {
      if (message.toLowerCase().includes(key)) {
        return friendlyMessage;
      }
    }

    // Default message
    return 'An unexpected error occurred. Please try again.';
  }

  /**
   * Get the global error handler instance
   * @returns {ErrorHandler} The error handler instance
   */
  async getErrorHandler() {
    return await this.errorHandler;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    // Use ResourceTracker cleanup for automatic resource management
    super.cleanup();
    
    this.logger.debug('ErrorHandlingService cleanup completed');
  }

  /**
   * Get debugging information
   * @returns {Object} Debug info
   */
  getDebugInfo() {
    return {
      errorHandler: 'Global ErrorHandler instance'
    };
  }
}
