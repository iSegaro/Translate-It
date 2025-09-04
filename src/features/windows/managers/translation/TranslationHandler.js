// src/managers/content/windows/translation/TranslationHandler.js

import browser from "webextension-polyfill";
import { sendSmart } from "@/shared/messaging/core/SmartMessaging.js"
import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { MessageActions } from "@/shared/messaging/core/MessageActions.js";
import { generateTranslationMessageId } from "@/utils/messaging/messageId.js";
import { determineTranslationMode } from "../../../../features/translation/utils/translationModeHelper.js";
import { TranslationMode, getSettingsAsync } from "@/shared/config/config.js";
import { ExtensionContextManager } from "@/core/extensionContext.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";

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
    try {
      let settings;
      
      try {
        settings = await getSettingsAsync();
      } catch (error) {
        // If extension context is invalidated, use fallback values
        if (ExtensionContextManager.isContextError(error)) {
          this.logger.debug('Extension context invalidated, using fallback settings for translation');
          settings = {
            SOURCE_LANGUAGE: 'auto',
            TARGET_LANGUAGE: 'fa',
            TRANSLATION_API: 'google'
          };
        } else {
          // Re-throw non-context errors
          throw error;
        }
      }
      
      const translationMode = determineTranslationMode(selectedText, TranslationMode.Selection);

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
      const ackOrResult = await sendSmart({
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

      // If sendSmart returned a RESULT directly (port fallback), use it
      this.logger.debug("sendSmart returned:", ackOrResult);
      
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

    } catch (error) {
      // Don't log here as error is already logged in port fallback or messageListener
      // Final error logging will be done in WindowsManager._handleTranslationError
      throw error;
    }
  }

  /**
   * Create promise that resolves when translation completes
   */
  _createTranslationPromise(messageId) {
    return new Promise((resolve, reject) => {
      // Set timeout
      const timeout = setTimeout(() => {
        this.activeRequests.delete(messageId);
        if (messageListener) {
          browser.runtime.onMessage.removeListener(messageListener);
        }
        reject(new Error('Translation timeout'));
      }, WindowsConfig.TIMEOUTS.TRANSLATION_TIMEOUT);

      // Create message listener
      const messageListener = (message) => {
        this.logger.debug(`Received message: ${message.action}, messageId: ${message.messageId}, expected: ${messageId}`);
        
        if (message.action === MessageActions.TRANSLATION_RESULT_UPDATE && 
            message.messageId === messageId) {
          
          this.logger.operation("Message matched! Processing translation result");
          clearTimeout(timeout);
          this.activeRequests.delete(messageId);
          browser.runtime.onMessage.removeListener(messageListener);
          
          // Check for error first - error can be in data.error or directly in data
          if (message.data?.error || (message.data?.type && message.data?.message)) {
            this.logger.debug("Error detected in messageListener, rejecting promise with error");
            const errorMessage = message.data?.error?.message || message.data?.message || 'Translation failed';
            reject(new Error(errorMessage));
            return;
          } else if (message.data?.translatedText) {
            this.logger.operation("Translation success received");
            resolve({ translatedText: message.data.translatedText });
          } else {
            this.logger.error("Unexpected message data - no error and no translatedText", message.data);
            // If no error object but also no translatedText, it's still an error
            reject(new Error('No translated text in result'));
          }
        }
      };

      // Store request info
      this.activeRequests.set(messageId, {
        resolve,
        reject,
        timeout,
        messageListener,
        startTime: Date.now()
      });

      // Add listener
      browser.runtime.onMessage.addListener(messageListener);
    });
  }

  /**
   * Cancel active translation request
   */
  cancelTranslation(messageId) {
    const request = this.activeRequests.get(messageId);
    if (!request) return;

    clearTimeout(request.timeout);
    browser.runtime.onMessage.removeListener(request.messageListener);
    this.activeRequests.delete(messageId);
    
    // Instead of rejecting with an error, resolve with a cancellation marker
    // This prevents uncaught promise rejection errors in the console
    request.resolve({ cancelled: true });
    
    this.logger.debug('Translation cancelled', { messageId });
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