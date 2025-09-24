// src/managers/content/windows/translation/TranslationHandler.js

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { generateTranslationMessageId } from "@/utils/messaging/messageId.js";
import { TranslationMode } from "@/shared/config/config.js";
import { settingsManager } from '@/shared/managers/SettingsManager.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { sendMessage } from "@/shared/messaging/core/UnifiedMessaging.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";

/**
 * Handles translation requests and responses for WindowsManager
 */
export class TranslationHandler {
  constructor() {
    this.logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'TranslationHandler');
    this.activeRequests = new Map();
  }

  /**
   * Perform translation request
   */
  async performTranslation(selectedText, options = {}) {
    let settings;

    settings = {
        SOURCE_LANGUAGE: settingsManager.get('SOURCE_LANGUAGE', 'auto'),
        TARGET_LANGUAGE: settingsManager.get('TARGET_LANGUAGE', 'fa'),
        TRANSLATION_API: settingsManager.get('TRANSLATION_API', 'google')
      };

      const translationMode = TranslationMode.Selection;

      // Generate unique messageId
      const messageId = generateTranslationMessageId('content');
      this.logger.debug(`Generated messageId: ${messageId}`);

      // Create promise for result
      const resultPromise = this._createTranslationPromise(messageId);

      // Prepare payload (force source language to 'auto')
      const payload = {
        text: selectedText,
        from: AUTO_DETECT_VALUE,
        to: settings.TARGET_LANGUAGE || 'fa',
        provider: settings.TRANSLATION_API || 'google',
        messageId: messageId,
        mode: translationMode,
        options: { ...options }
      };

      this.logger.debug("Sending translation request", payload);

      // Send translation request using reliable messenger (retries + port fallback)
      const ackOrResult = await sendMessage({
        action: MessageActions.TRANSLATE,
        context: 'content',
        messageId: messageId,
        data: {
          text: payload.text,
          provider: payload.provider,
          sourceLanguage: payload.from,
          targetLanguage: payload.to,
          mode: payload.mode,
          options: payload.options
        }
      })

      // Check if sendMessage returned the complete result directly
      this.logger.debug("sendMessage returned:", ackOrResult);
      
      if (ackOrResult && ackOrResult.translatedText) {
        // Direct result from sendMessage - use it immediately
        this.logger.operation("Translation completed successfully (direct result)");
        
        // Clean up the timeout and pending request
        const request = this.activeRequests.get(messageId);
        if (request && request.timeout) {
          clearTimeout(request.timeout);
        }
        this.activeRequests.delete(messageId);
        
        return { 
          translatedText: ackOrResult.translatedText,
          targetLanguage: payload.to 
        };
      }
      
      if (ackOrResult && (ackOrResult.type === 'RESULT' || ackOrResult.result)) {
        const final = ackOrResult.result || ackOrResult
        this.logger.debug("Port fallback detected, final result:", final);
        
        // Check for error in port fallback result
        if (final.success === false && final.error) {
          this.logger.debug("Port fallback detected error, will be handled by WindowsManager:", final.error);
          const errorMessage = final.error.message || final.error || 'Translation failed';
          throw new Error(errorMessage);
        }
        
        if (!final || !final.translatedText) {
          this.logger.error("Port fallback result has no translatedText:", final);
          throw new Error('Translation failed: No translated text received')
        }
        this.logger.operation("Translation completed successfully (via port fallback)");
        
        // Clean up the timeout and pending request
        const request = this.activeRequests.get(messageId);
        if (request && request.timeout) {
          clearTimeout(request.timeout);
        }
        this.activeRequests.delete(messageId);
        
        return { translatedText: final.translatedText }
      }

      // Otherwise wait for the translation result via messaging (TRANSLATION_RESULT_UPDATE)
      try {
        const result = await resultPromise;
        
        this.logger.debug("resultPromise resolved with:", result);
        
        // Check if translation was cancelled
        if (result?.cancelled) {
          this.logger.debug("Translation was cancelled via promise resolution");
          throw new Error('Translation cancelled');
        }
        
        // If we reach here successfully, the result should be valid
        if (!result?.translatedText) {
          this.logger.error("resultPromise resolved but no translatedText - this should not happen");
          throw new Error('Translation failed: No translated text received');
        }

        this.logger.operation("Translation completed successfully");
        return result;
      } catch (resultError) {
        // Preserve the specific error message from resultPromise
        this.logger.error("resultPromise was rejected with error:", resultError.message);
        this.logger.debug("Full error object:", resultError);
        throw resultError; // Re-throw the original error from messageListener
      }

  }

  /**
   * Create promise that resolves when translation completes
   * Uses central message handler instead of temporary listeners
   */
  _createTranslationPromise(messageId) {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.activeRequests.delete(messageId);
        reject(new Error('Translation timeout'));
      }, WindowsConfig.TIMEOUTS.TRANSLATION_TIMEOUT);

      // Store request info for central handler to find
      this.activeRequests.set(messageId, {
        resolve,
        reject,
        timeout,
        startTime: Date.now()
      });
    });
  }

  /**
   * Cancel active translation request
   */
  cancelTranslation(messageId) {
    const request = this.activeRequests.get(messageId);
    if (!request) return;

    clearTimeout(request.timeout);
    this.activeRequests.delete(messageId);
    
    // Instead of rejecting with an error, resolve with a cancellation marker
    // This prevents uncaught promise rejection errors in the console
    request.resolve({ cancelled: true });
    
    this.logger.debug('Translation cancelled', { messageId });
  }

  /**
   * Handle translation result from central message handler
   * This method will be called by the central handler when TRANSLATION_RESULT_UPDATE is received
   */
  handleTranslationResult(message) {
    const { messageId } = message;
    const request = this.activeRequests.get(messageId);
    
    if (!request) {
      this.logger.debug(`No active request found for messageId: ${messageId}`);
      return false;
    }

    this.logger.operation("Message matched! Processing translation result");
    clearTimeout(request.timeout);
    this.activeRequests.delete(messageId);
    
    // Check for error first - error can be in data.error or directly in data
    if (message.data?.error || (message.data?.type && message.data?.message)) {
      this.logger.debug("Error detected in central handler, rejecting promise with error");
      const errorMessage = message.data?.error?.message || message.data?.message || 'Translation failed';
      request.reject(new Error(errorMessage));
      return true;
    } else if (message.data?.translatedText) {
      this.logger.operation("Translation success received");
      request.resolve({ 
        translatedText: message.data.translatedText,
        targetLanguage: message.data.targetLanguage 
      });
      return true;
    } else {
      this.logger.error("Unexpected message data - no error and no translatedText", message.data);
      request.reject(new Error('No translated text in result'));
      return true;
    }
  }

  /**
   * Cancel all active translations
   */
  cancelAllTranslations() {
    for (const [messageId] of this.activeRequests) {
      this.cancelTranslation(messageId);
    }
    this.logger.debug('All translations cancelled');
  }

  /**
   * Get active request count
   */
  getActiveRequestCount() {
    return this.activeRequests.size;
  }

  /**
   * Get request info
   */
  getRequestInfo(messageId) {
    const request = this.activeRequests.get(messageId);
    if (!request) return null;

    return {
      messageId,
      startTime: request.startTime,
      duration: Date.now() - request.startTime
    };
  }

  /**
   * Get all active requests info
   */
  getAllRequestsInfo() {
    return Array.from(this.activeRequests.keys()).map(messageId => 
      this.getRequestInfo(messageId)
    );
  }

  /**
   * Cleanup handler
   */
  cleanup() {
    this.cancelAllTranslations();
    this.activeRequests.clear();
    this.logger.debug('TranslationHandler cleanup completed');
  }
}