import browser from "webextension-polyfill";
import { applyTranslationsToNodes, expandTextsForTranslation, reassembleTranslations, separateCachedAndNewTexts } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../shared/logging/logger.js";
import { LOG_COMPONENTS } from "../../../../shared/logging/logConstants.js";
import { getTimeoutAsync, TranslationMode } from "@/shared/config/config.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { generateContentMessageId } from "@/utils/messaging/messageId.js";
import { TRANSLATION_TIMEOUT_FALLBACK, TIMEOUT_CONFIG } from "../constants/selectElementConstants.js";

import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { sendSmart } from "@/shared/messaging/core/SmartMessaging.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { pageEventBus } from '@/core/PageEventBus.js';
import { ErrorHandler } from '@/shared/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';

export class TranslationOrchestrator {
  constructor(stateManager) {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TranslationOrchestrator');
    this.stateManager = stateManager;
    this.translationRequests = new Map();
    this.escapeKeyListener = null;
    this.statusNotification = null;
    this.errorHandler = ErrorHandler.getInstance();
  }

  async initialize() {
    this.logger.debug('TranslationOrchestrator initialized');
    
    // Set up periodic cleanup of old timeout requests (every 5 minutes)
    setInterval(() => this.cleanupOldTimeoutRequests(), 5 * 60 * 1000);
  }

  /**
   * Clean up old timeout requests that are unlikely to receive late results
   */
  cleanupOldTimeoutRequests() {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutes
    let cleanedCount = 0;

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'timeout' && request.timeoutAt) {
        const age = now - request.timeoutAt;
        if (age > maxAge) {
          this.translationRequests.delete(messageId);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} old timeout requests`);
    }
  }

  /**
   * Calculate dynamic timeout based on the number of segments to translate
   * @param {number} segmentCount - Number of translation segments
   * @returns {number} - Timeout in milliseconds
   */
  calculateDynamicTimeout(segmentCount) {
    if (!segmentCount || segmentCount <= 0) {
      return TRANSLATION_TIMEOUT_FALLBACK;
    }

    // Calculate timeout: base + (segments × time per segment)
    const calculatedTimeout = TIMEOUT_CONFIG.BASE_TIMEOUT + (segmentCount * TIMEOUT_CONFIG.TIME_PER_SEGMENT);
    
    // Apply min/max constraints
    const finalTimeout = Math.max(
      TIMEOUT_CONFIG.MIN_TIMEOUT,
      Math.min(calculatedTimeout, TIMEOUT_CONFIG.MAX_TIMEOUT)
    );

    this.logger.debug(`Dynamic timeout calculated: ${segmentCount} segments → ${finalTimeout}ms (${finalTimeout/1000}s)`);
    return finalTimeout;
  }

  async processSelectedElement(element, originalTextsMap, textNodes) {
    this.logger.operation("Starting advanced translation process for selected element");
    
    // Check extension context before proceeding
    if (!ExtensionContextManager.isValidSync()) {
      const contextError = new Error('Extension context invalidated');
      ExtensionContextManager.handleContextError(contextError, 'select-element-translation');
      throw contextError;
    }
    
    const messageId = generateContentMessageId();

    const statusMessage = await getTranslationString("STATUS_TRANSLATING") || "Translating...";
    this.statusNotification = `status-${messageId}`;
    pageEventBus.emit('show-notification', {
      id: this.statusNotification,
      message: statusMessage,
      type: "status",
    });

    try {
      const { textsToTranslate, cachedTranslations } = separateCachedAndNewTexts(originalTextsMap);

      if (textsToTranslate.length === 0 && cachedTranslations.size > 0) {
        this.logger.info("Applying translations from cache only.");
        // Store translations in state manager
        this.stateManager.addTranslatedElement(element, cachedTranslations);
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, cachedTranslations);
        // Dismiss the status notification since translation is complete
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return;
      }

      if (textsToTranslate.length === 0) {
        this.logger.info("No new texts to translate.");
        // Dismiss the status notification since there's nothing to translate
        if (this.statusNotification) {
          pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
          this.statusNotification = null;
        }
        return;
      }

      const { expandedTexts, originMapping } = expandTextsForTranslation(textsToTranslate);
      const jsonPayload = JSON.stringify(expandedTexts.map(t => ({ text: t })));

      this.translationRequests.set(messageId, {
        element,
        textNodes,
        textsToTranslate,
        originMapping,
        expandedTexts,
        cachedTranslations,
        status: 'pending',
        timestamp: Date.now()
      });

      await this.sendTranslationRequest(messageId, jsonPayload);
      await this.setupTranslationWaiting(messageId, element, expandedTexts.length);

    } catch (error) {
      // Don't log or handle errors that are already handled
      if (!error.alreadyHandled) {
        this.logger.error("Translation process failed", error);
      }
      
      this.translationRequests.delete(messageId);
      // Dismiss the status notification on error
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      }
      
      throw error;
    }
  }

  async sendTranslationRequest(messageId, jsonPayload) {
    try {
      const { getTranslationApiAsync, getTargetLanguageAsync } = await import("../../../../config.js");
      const provider = await getTranslationApiAsync();
      const targetLanguage = await getTargetLanguageAsync();

      const translationRequest = {
        action: MessageActions.TRANSLATE,
        data: {
          text: jsonPayload,
          provider,
          sourceLanguage: AUTO_DETECT_VALUE,
          targetLanguage,
          mode: TranslationMode.Select_Element,
          options: { rawJsonPayload: true },
        },
        context: 'event-handler',
        messageId,
      };

      this.logger.debug("Sending translation request with advanced payload");
      
      // Use safe messaging through ExtensionContextManager
      const result = await ExtensionContextManager.safeSendMessage(translationRequest, 'select-element-translation');
      
      if (result === null) {
        throw new Error('Extension context invalidated during translation request');
      }

      this.logger.debug("Translation request sent successfully");
    } catch (error) {
      this.logger.error("Failed to send translation request", error);
      throw error;
    }
  }

  async setupTranslationWaiting(messageId, element, segmentCount = 0) {
    this.logger.debug("Setting up translation waiting for message:", messageId);
    
    // Use dynamic timeout based on segment count, fallback to config timeout
    let timeout;
    if (segmentCount > 0) {
      timeout = this.calculateDynamicTimeout(segmentCount);
      this.logger.info(`Using dynamic timeout for ${segmentCount} segments: ${timeout/1000}s`);
    } else {
      timeout = await getTimeoutAsync() || TRANSLATION_TIMEOUT_FALLBACK;
      this.logger.info(`Using standard config timeout: ${timeout/1000}s`);
    }

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Translation timeout after ${timeout}ms`)), timeout);
    });

    try {
      await Promise.race([this.waitForTranslationResult(messageId), timeoutPromise]);
      this.logger.debug("Translation completed successfully for message:", messageId);
    } catch (error) {
      // Don't log errors that are already handled
      if (!error.alreadyHandled) {
        this.logger.error("Translation waiting failed", error);
      }
      
      const request = this.translationRequests.get(messageId);
      if (request) {
        // For timeout errors, mark as 'timeout' instead of deleting the request
        // This allows late results to be handled gracefully
        if (error.message && error.message.includes('timeout')) {
          request.status = 'timeout';
          request.error = error.message;
          request.timeoutAt = Date.now();
          this.logger.warn(`Translation marked as timeout for messageId: ${messageId}. Will handle late results gracefully.`);
        } else {
          request.status = 'error';
          request.error = error.message;
        }
      }
      throw error;
    } finally {
      window.isTranslationInProgress = false;
      if (this.statusNotification) {
        pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
        this.statusNotification = null;
      }
    }
  }

  waitForTranslationResult(messageId) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const request = this.translationRequests.get(messageId);
        if (!request) {
          clearInterval(checkInterval);
          reject(new Error(`Translation request ${messageId} not found`));
          return;
        }
        if (request.status === 'completed') {
          clearInterval(checkInterval);
          resolve(request.result);
        } else if (request.status === 'error') {
          clearInterval(checkInterval);
          // Handle error properly to avoid [object Object]
          const errorMessage = typeof request.error === 'string' 
            ? request.error 
            : (request.error?.message || JSON.stringify(request.error) || 'Translation failed');
          const error = new Error(errorMessage);
          error.alreadyHandled = true; // Mark as already handled since handleTranslationResult already showed notification
          reject(error);
        } else if (request.status === 'cancelled') {
          clearInterval(checkInterval);
          const errorMessage = typeof request.error === 'string' 
            ? request.error 
            : (request.error?.message || 'Translation cancelled by user');
          reject(new Error(errorMessage));
        }
      }, 100);
    });
  }

  async handleTranslationResult(message) {
    const { messageId, data } = message;
    
    // Enhanced logging: Log raw data received from background
    this.logger.debug("Received translation result:", { 
      messageId, 
      success: data?.success,
      hasError: !!data?.error,
      errorType: typeof data?.error,
      rawErrorPreview: data?.error ? String(data?.error).substring(0, 100) : 'none'
    });

    const request = this.translationRequests.get(messageId);
    if (!request) {
      this.logger.warn("Received translation result for unknown message:", messageId);
      return;
    }
    
    // Handle late results for timed-out translations
    if (request.status === 'timeout') {
      const timesinceTimeout = Date.now() - (request.timeoutAt || 0);
      this.logger.info(`Received late translation result for timed-out messageId: ${messageId} (${timesinceTimeout}ms after timeout)`);
      
      // If it's a successful late result, we can still apply it
      if (data?.success) {
        this.logger.info("Applying late translation result despite timeout");
        // Continue with normal processing
      } else {
        // If late result is also an error, just log and ignore
        this.logger.warn("Late translation result is also an error, ignoring");
        return;
      }
    }
    
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring translation result for cancelled message:", messageId);
      return;
    }
    
    if (request.status !== 'pending' && request.status !== 'timeout') {
      this.logger.debug("Received translation result for already completed message:", messageId);
      return;
    }

    // Preserve original error for safety before any processing
    const originalErrorBackup = data?.error;
    this.logger.debug("Original error backup created:", { 
      hasBackup: !!originalErrorBackup,
      backupType: typeof originalErrorBackup
    });

    try {
      if (data?.success) {
        const { translatedText } = data;
        const translatedData = JSON.parse(translatedText);
        const { textsToTranslate, originMapping, expandedTexts, cachedTranslations, textNodes, element } = request;

        const newTranslations = reassembleTranslations(
          translatedData,
          expandedTexts,
          originMapping,
          textsToTranslate,
          cachedTranslations
        );

        const allTranslations = new Map([...cachedTranslations, ...newTranslations]);
        
        // Store translations in state manager for potential revert
        this.stateManager.addTranslatedElement(element, allTranslations);
        
        // Apply translations directly to DOM nodes (like OLD system)
        this.applyTranslationsToNodes(textNodes, allTranslations);

        request.status = 'completed';
        request.result = data;
        this.logger.info("Translation applied successfully to DOM elements", { messageId });
      } else {
        // ENHANCED ERROR HANDLING: Process error with comprehensive logging and safety
        this.logger.debug("Processing translation error...");
        
        let processedErrorMessage;
        let safeErrorForHandler;
        
        try {
          // Safe error message extraction with multiple fallbacks
          if (typeof originalErrorBackup === 'string' && originalErrorBackup.length > 0) {
            processedErrorMessage = originalErrorBackup;
            safeErrorForHandler = originalErrorBackup;
            this.logger.debug("Using string error from backup:", processedErrorMessage);
          } else if (originalErrorBackup && typeof originalErrorBackup === 'object' && originalErrorBackup.message) {
            processedErrorMessage = originalErrorBackup.message;
            safeErrorForHandler = originalErrorBackup.message;
            this.logger.debug("Using error.message from backup:", processedErrorMessage);
          } else if (originalErrorBackup) {
            // Safe JSON stringify with error handling
            try {
              processedErrorMessage = JSON.stringify(originalErrorBackup);
              safeErrorForHandler = processedErrorMessage;
              this.logger.debug("Using JSON.stringify of error:", processedErrorMessage);
            } catch (jsonError) {
              processedErrorMessage = 'Translation failed - Error details unavailable';
              safeErrorForHandler = processedErrorMessage;
              this.logger.warn("Failed to stringify error, using fallback:", jsonError);
            }
          } else {
            processedErrorMessage = 'Translation failed - No error details';
            safeErrorForHandler = processedErrorMessage;
            this.logger.warn("No error details available, using generic message");
          }
          
        } catch (extractionError) {
          // If error extraction itself fails, use the backup
          this.logger.error("Error during error extraction, using ultimate fallback:", extractionError);
          processedErrorMessage = originalErrorBackup ? String(originalErrorBackup) : 'Translation failed';
          safeErrorForHandler = processedErrorMessage;
        }

        // Store error in request safely
        request.status = 'error';
        request.error = processedErrorMessage;
        
        this.logger.debug("Final processed error message:", processedErrorMessage);
        this.logger.error("Translation failed", { messageId, originalError: originalErrorBackup, processedError: processedErrorMessage });
        
        // Create error object for ErrorHandler with safety measures
        let translationError;
        try {
          translationError = new Error(safeErrorForHandler);
          translationError.originalError = originalErrorBackup;
        } catch (errorCreationError) {
          this.logger.error("Failed to create Error object:", errorCreationError);
          translationError = new Error('Translation failed - Error processing failed');
          translationError.originalError = originalErrorBackup;
        }
        
        // Use centralized error handling
        try {
          await this.errorHandler.handle(translationError, {
            context: 'select-element-translation',
            type: ErrorTypes.TRANSLATION_FAILED,
            showToast: true
          });
        } catch (handlerError) {
          this.logger.error("ErrorHandler.handle() failed:", handlerError);
          // Fallback: show notification directly if ErrorHandler fails
          pageEventBus.emit('show-notification', {
            id: `error-${Date.now()}`,
            message: safeErrorForHandler || 'Translation failed',
            type: 'error',
            duration: 4000
          });
        }
        
        // Mark this error as already handled to prevent duplicate notifications
        translationError.alreadyHandled = true;
        throw translationError;
      }
    } catch (e) {
      // Enhanced catch block with better error preservation
      if (e.alreadyHandled) {
        this.logger.debug("Re-throwing already handled error:", e.message);
        throw e;
      }
      
      this.logger.error("Unexpected error during translation result handling:", e);
      this.logger.error("Original error backup was:", originalErrorBackup);
      
      // Update request status with preserved information
      request.status = 'error';
      
      // Use original error if this was a JavaScript error during processing
      if (originalErrorBackup && !data?.success) {
        const fallbackMessage = typeof originalErrorBackup === 'string' 
          ? originalErrorBackup 
          : (originalErrorBackup?.message || 'Translation failed');
        request.error = fallbackMessage;
        this.logger.debug("Using original error as fallback:", fallbackMessage);
        
        // Try to show the original error to user
        try {
          pageEventBus.emit('show-notification', {
            id: `error-fallback-${Date.now()}`,
            message: fallbackMessage,
            type: 'error',
            duration: 4000
          });
        } catch (notifyError) {
          this.logger.error("Failed to show fallback notification:", notifyError);
        }
        
        // Create a new error with the original message
        const fallbackError = new Error(fallbackMessage);
        fallbackError.originalError = originalErrorBackup;
        fallbackError.processingError = e;
        fallbackError.alreadyHandled = true;
        throw fallbackError;
      } else {
        request.error = e.message;
        throw e;
      }
    }
  }

  /**
   * Apply translations directly to DOM nodes (like OLD system)
   * @param {Array} textNodes - Array of text nodes to translate
   * @param {Map} translations - Map of original text to translated text
   */
  applyTranslationsToNodes(textNodes, translations) {
    this.logger.debug("Applying translations directly to DOM nodes", {
      textNodesCount: textNodes.length,
      translationsSize: translations.size
    });
    
    // Create simple context for the extraction utility
    const context = {
      state: {
        originalTexts: this.stateManager.originalTexts || new Map()
      }
    };
    
    // Use the existing applyTranslationsToNodes from extraction utilities
    applyTranslationsToNodes(textNodes, translations, context);
    
    this.logger.debug("Translations applied directly to DOM nodes", {
      appliedCount: translations.size
    });
  }

  cancelAllTranslations() {
    this.logger.operation("Cancelling all ongoing translations");

    for (const [messageId, request] of this.translationRequests) {
      if (request.status === 'pending') {
        request.status = 'cancelled';
        request.error = 'Translation cancelled by user';
        
        // Notify background to cancel the network request
        sendSmart({
          action: MessageActions.CANCEL_TRANSLATION,
          messageId: messageId,
          data: { messageId: messageId }
        }).catch(err => this.logger.warn('Failed to send cancellation message to background', err));
      }
    }
    if (this.statusNotification) {
      pageEventBus.emit('dismiss_notification', { id: this.statusNotification });
      this.statusNotification = null;
    }
  }

  async cleanup() {
    this.cancelAllTranslations();
    this.translationRequests.clear();
    this.removeEscapeKeyListener();
    this.logger.debug('TranslationOrchestrator cleanup completed');
  }

  getDebugInfo() {
    return { activeRequests: this.translationRequests.size };
  }
}
