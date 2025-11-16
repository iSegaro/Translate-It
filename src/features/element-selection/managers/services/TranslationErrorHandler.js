import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { TranslationMode } from "@/shared/config/config.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";
import { unifiedTranslationCoordinator } from '@/shared/messaging/core/UnifiedTranslationCoordinator.js';
import { sendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';

/**
 * Handles error detection, classification, and retry logic with fallback providers
 * Manages timeout notifications, user cancellation, and error recovery
 */
export class TranslationErrorHandler {
  constructor(orchestrator) {
    this.orchestrator = orchestrator;
    this.logger = getScopedLogger(LOG_COMPONENTS.ELEMENT_SELECTION, 'TranslationErrorHandler');
    this.errorHandler = ErrorHandler.getInstance(); // Direct access to ErrorHandler singleton
  }

  /**
   * Check if an error is recoverable and should trigger a retry
   * @param {Error} error - Error to analyze
   * @param {Object} request - Translation request data
   * @returns {boolean} True if error is recoverable
   */
  isRecoverableError(error, request) {
    // Don't retry if already retried or cancelled
    if (request.retryAttempt || request.status === 'cancelled') {
      return false;
    }

    // Check for recoverable error types
    const recoverableErrorTypes = [
      ErrorTypes.HTML_RESPONSE_ERROR,
      ErrorTypes.JSON_PARSING_ERROR,
      ErrorTypes.TRANSLATION_FAILED
    ];

    const isRecoverable = recoverableErrorTypes.includes(error.type) ||
      (error.message && (
        error.message.includes('HTML response') ||
        error.message.includes('JSON parsing') ||
        error.message.includes('Failed to execute \'json\' on \'Response\'')
      ));

    this.logger.debug('Error recoverability check', {
      errorType: error.type,
      errorMessage: error.message,
      isRecoverable,
      retryAttempt: request.retryAttempt || 0
    });

    return isRecoverable;
  }

  /**
   * Show timeout notification to user
   * @param {string} messageId - Message ID
   */
  async showTimeoutNotification(messageId) {
    const { getTranslationString } = await import("../../../../utils/i18n/i18n.js");
    const timeoutMessage = await getTranslationString('ERRORS_TRANSLATION_TIMEOUT');

    // Use pageEventBus to show notification
    pageEventBus.emit('show-notification', {
      type: 'warning',
      title: 'Translation Timeout',
      message: timeoutMessage || 'Translation is taking longer than expected. Please wait or try again.',
      duration: 10000, // Show for 10 seconds
      id: `timeout-${messageId}`
    });

    this.logger.debug('Showed timeout notification', { messageId });
  }

  /**
   * Handle streaming error from unified system
   * @param {string} messageId - Message ID
   * @param {Error} error - Error object
   */
  async handleStreamingError(messageId, error) {
    this.logger.error(`Streaming error for ${messageId}:`, error);

    // Notify UnifiedTranslationCoordinator about the streaming error
    unifiedTranslationCoordinator.handleStreamingError(messageId, error);

    // Update request status
    const request = this.orchestrator.requestManager.getRequest(messageId);
    if (request) {
      this.orchestrator.requestManager.updateRequestStatus(messageId, 'error', { error });
    }

    // Clear global flags and notifications
    window.isTranslationInProgress = false;

    // Dismiss any active notifications
    if (this.orchestrator.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.orchestrator.statusNotification });
      this.orchestrator.statusNotification = null;
    }

    // Show error to user if not cancelled
    if (!this.orchestrator.requestManager.isUserCancelled(messageId)) {
      await this.showErrorToUser(error, {
        context: 'select-element-streaming',
        type: ErrorTypes.TRANSLATION_FAILED,
        messageId
      });
    }

    // Cleanup request
    this.orchestrator.requestManager.removeRequest(messageId);
    this.orchestrator.requestManager.clearUserCancelledRequests();

    // Notify SelectElementManager
    if (window.selectElementManagerInstance) {
      window.selectElementManagerInstance.performPostTranslationCleanup();
    }
  }

  /**
   * Show error to user with appropriate formatting
   * @param {Error} error - Error to show
   * @param {Object} context - Error context options
   */
  async showErrorToUser(error, context = {}) {
    try {
      await this.errorHandler.handle(error, {
        context: context.context || 'translation-error',
        type: context.type || ErrorTypes.TRANSLATION_FAILED,
        showToast: context.showToast !== false,
        messageId: context.messageId
      });
    } catch (handlerError) {
      this.logger.error('Failed to show error to user', handlerError);

      // Fallback notification
      pageEventBus.emit('show-notification', {
        type: 'error',
        title: 'Translation Error',
        message: error.message || 'An unexpected error occurred during translation',
        duration: 5000,
        id: `fallback-error-${Date.now()}`
      });
    }
  }

  /**
   * Handle context errors (extension invalidation)
   * @param {Error} error - Context error
   * @param {string} context - Context identifier
   */
  handleContextError(error, context) {
    const ExtensionContextManager = window.ExtensionContextManager ||
      (() => import('@/core/extensionContext.js').then(m => m.default));

    if (ExtensionContextManager.isContextError && ExtensionContextManager.isContextError(error)) {
      this.logger.debug("Context error detected (expected behavior)", {
        context,
        errorMessage: error.message
      });

      // Handle via ExtensionContextManager
      if (ExtensionContextManager.handleContextError) {
        ExtensionContextManager.handleContextError(error, context);
      }

      return true; // Was a context error
    }

    return false; // Not a context error
  }

  /**
   * Retry translation with a fallback provider
   * @param {string} messageId - Original message ID
   * @param {string} jsonPayload - Translation payload
   * @param {Error} originalError - Original error that triggered retry
   * @returns {Promise<boolean>} - True if retry was successful
   */
  async retryWithFallbackProvider(messageId, jsonPayload, originalError) {
    try {
      this.logger.info('Attempting translation retry with fallback provider', {
        messageId,
        originalError: originalError.message
      });

      // Check if request still exists
      const request = this.orchestrator.requestManager.getRequest(messageId);
      if (!request) {
        this.logger.warn('Cannot retry: request not found', { messageId });
        return false;
      }

      // Get available providers
      const { getAvailableProvidersAsync } = await import("../../../../config.js");
      const availableProviders = await getAvailableProvidersAsync();

      // Get current provider
      const { getTranslationApiAsync } = await import("../../../../config.js");
      const currentProvider = await getTranslationApiAsync();
      const currentProviderName = currentProvider?.providerName || 'unknown';

      // Find next available provider that isn't the current one
      const fallbackProvider = availableProviders.find(p =>
        p.name !== currentProviderName &&
        p.enabled &&
        p.configured
      );

      if (!fallbackProvider) {
        this.logger.warn('No fallback provider available', {
          currentProvider: currentProviderName,
          availableProviders: availableProviders.map(p => p.name)
        });

        // Show no fallback notification
        pageEventBus.emit('show-notification', {
          type: 'error',
          title: 'Translation Failed',
          message: `Failed with ${currentProviderName} and no fallback providers available`,
          duration: 5000,
          id: `no-fallback-${messageId}`
        });

        return false;
      }

      this.logger.info('Found fallback provider for retry', {
        currentProvider: currentProviderName,
        fallbackProvider: fallbackProvider.name
      });

      // Update request to indicate retry attempt
      this.orchestrator.requestManager.updateRequestStatus(messageId, 'retrying', {
        retryAttempt: (request.retryAttempt || 0) + 1,
        originalProvider: currentProviderName,
        fallbackProvider: fallbackProvider.name
      });

      // Show retry notification
      pageEventBus.emit('show-notification', {
        type: 'info',
        title: 'Retrying Translation',
        message: `Failed with ${currentProviderName}, retrying with ${fallbackProvider.name}...`,
        duration: 3000,
        id: `retry-${messageId}`
      });

      // Create new message ID for retry to avoid conflicts
      const retryMessageId = generateContentMessageId('select-element-retry');

      // Prepare retry request
      const retryRequest = {
        ...request,
        retryOriginalMessageId: messageId,
        originalProvider: currentProviderName,
        fallbackProvider: fallbackProvider,
        status: 'pending'
      };

      // Store retry request
      this.orchestrator.requestManager.createStreamingRequest(retryMessageId, retryRequest);

      // Send retry request with fallback provider
      const { setTranslationApiAsync } = await import("../../../../config.js");
      await setTranslationApiAsync(fallbackProvider.name);

      // Send the translation request through unified messaging
      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: jsonPayload,
          sourceLanguage: request.sourceLang || 'auto',
          targetLanguage: request.targetLang,
          mode: TranslationMode.SelectElement,
          messageId: retryMessageId,
          context: 'select-element-retry'
        }
      };

      // Register streaming handler for retry
      this.orchestrator.streamingEngine.streamingHandler.registerHandler(retryMessageId, {
        onStreamUpdate: (data) => this.orchestrator.uiManager.handleStreamUpdate({ messageId: retryMessageId, data }),
        onStreamEnd: (data) => this._handleRetryStreamEnd({ messageId: retryMessageId, originalMessageId: messageId, data }),
        onTranslationResult: (data) => this.orchestrator.uiManager.handleTranslationResult({ messageId: retryMessageId, data }),
        onError: (error) => this.handleStreamingError(retryMessageId, error)
      });

      // Send retry request
      await sendMessage(translationRequest);

      this.logger.info('Retry translation request sent successfully', {
        retryMessageId,
        fallbackProvider: fallbackProvider.name
      });

      return true;

    } catch (retryError) {
      this.logger.error('Failed to retry translation with fallback provider', retryError);

      // Show error notification for retry failure
      pageEventBus.emit('show-notification', {
        type: 'error',
        title: 'Translation Retry Failed',
        message: `Failed to retry translation: ${retryError.message}`,
        duration: 5000,
        id: `retry-failed-${messageId}`
      });

      return false;
    }
  }

  /**
   * Handle stream end for retry requests
   * @param {Object} params - Stream end parameters
   */
  async _handleRetryStreamEnd({ messageId, originalMessageId, data }) {
    const retryRequest = this.orchestrator.requestManager.getRequest(messageId);
    const originalRequest = this.orchestrator.requestManager.getRequest(originalMessageId);

    this.logger.debug('Handling retry stream end', {
      messageId,
      originalMessageId,
      success: data?.success
    });

    if (!retryRequest || !originalRequest) {
      this.logger.warn('Missing request data for retry stream end');
      return;
    }

    try {
      if (data?.success && !data?.error) {
        // Retry was successful - update original request with results
        this.orchestrator.requestManager.updateRequestStatus(originalMessageId, 'completed', {
          result: data,
          translatedSegments: retryRequest.translatedSegments,
          retrySuccessful: true,
          fallbackProviderUsed: retryRequest.fallbackProvider
        });

        // Clean up retry request
        this.orchestrator.requestManager.removeRequest(messageId);

        // Show success notification
        pageEventBus.emit('show-notification', {
          type: 'success',
          title: 'Translation Successful',
          message: `Successfully translated using ${retryRequest.fallbackProvider.name} after retry`,
          duration: 5000,
          id: `retry-success-${originalMessageId}`
        });

        this.logger.info('Translation retry successful', {
          originalMessageId,
          fallbackProvider: retryRequest.fallbackProvider.name
        });
      } else {
        // Retry also failed
        this.orchestrator.requestManager.updateRequestStatus(originalMessageId, 'error', {
          error: data?.error || retryRequest.lastError,
          retryFailed: true
        });

        // Clean up retry request
        this.orchestrator.requestManager.removeRequest(messageId);

        // Show error notification
        await this.showErrorToUser(
          new Error(`Translation failed with both ${retryRequest.originalProvider} and ${retryRequest.fallbackProvider.name}`),
          {
            context: 'select-element-retry-failed',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          }
        );

        this.logger.error('Translation retry failed', {
          originalMessageId,
          originalProvider: retryRequest.originalProvider,
          fallbackProvider: retryRequest.fallbackProvider.name,
          error: data?.error
        });
      }
    } catch (error) {
      this.logger.error('Error handling retry stream end', error);
    } finally {
      // Always trigger cleanup for the original request
      const finalRequest = this.orchestrator.requestManager.getRequest(originalMessageId);
      if (finalRequest && (finalRequest.status === 'completed' || finalRequest.status === 'error')) {
        window.isTranslationInProgress = false;

        if (this.orchestrator.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.orchestrator.statusNotification });
          this.orchestrator.statusNotification = null;
        }

        // Trigger cleanup
        if (window.selectElementManagerInstance) {
          window.selectElementManagerInstance.performPostTranslationCleanup();
        }
      }
    }
  }

  /**
   * Get error statistics
   * @returns {Object} Error statistics
   */
  getErrorStats() {
    const requests = this.orchestrator.requestManager;
    const errorRequests = requests.getRequestsWithStatus('error');
    const timeoutRequests = requests.getRequestsWithStatus('timeout');

    return {
      errorRequests: errorRequests.length,
      timeoutRequests: timeoutRequests.length,
      totalErrors: errorRequests.length + timeoutRequests.length
    };
  }

  /**
   * Cleanup error handler
   */
  cleanup() {
    this.logger.debug('TranslationErrorHandler cleanup completed');
  }
}