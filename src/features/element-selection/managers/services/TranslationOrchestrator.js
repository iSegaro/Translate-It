import browser from "webextension-polyfill";
import { applyTranslationsToNodes, expandTextsForTranslation, reassembleTranslations, separateCachedAndNewTexts } from "../../../../utils/text/extraction.js";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { getTimeoutAsync, TranslationMode } from "../../../../config.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateContentMessageId } from "../../../../utils/messaging/messageId.js";
import { TRANSLATION_TIMEOUT_FALLBACK } from "../constants/selectElementConstants.js";

import { getTranslationString } from "../../../../utils/i18n/i18n.js";
import { sendSmart } from "@/messaging/core/SmartMessaging.js";
import { AUTO_DETECT_VALUE } from "../../../../constants.js";
import { pageEventBus } from '@/utils/core/PageEventBus.js';
import { ErrorHandler } from '@/error-management/ErrorHandler.js';
import { ErrorTypes } from '@/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/utils/core/extensionContext.js';

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
      await this.setupTranslationWaiting(messageId, element);

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

  async setupTranslationWaiting(messageId, element) {
    this.logger.debug("Setting up translation waiting for message:", messageId);
    const timeout = await getTimeoutAsync() || TRANSLATION_TIMEOUT_FALLBACK;

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
        request.status = 'error';
        request.error = error.message;
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
    
    if (request.status === 'cancelled') {
      this.logger.debug("Ignoring translation result for cancelled message:", messageId);
      return;
    }
    
    if (request.status !== 'pending') {
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
