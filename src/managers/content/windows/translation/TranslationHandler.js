// src/managers/content/windows/translation/TranslationHandler.js

import browser from "webextension-polyfill";
import { getScopedLogger } from "../../../../utils/core/logger.js";
import { LOG_COMPONENTS } from "../../../../utils/core/logConstants.js";
import { WindowsConfig } from "../core/WindowsConfig.js";
import { MessageActions } from "../../../../messaging/core/MessageActions.js";
import { generateTranslationMessageId } from "../../../../utils/messaging/messageId.js";
import { determineTranslationMode } from "../../../../utils/translationModeHelper.js";
import { TranslationMode, getSettingsAsync } from "../../../../config.js";

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
      const settings = await getSettingsAsync();
      const translationMode = determineTranslationMode(selectedText, TranslationMode.Selection);
      
      // Generate unique messageId
      const messageId = generateTranslationMessageId('content');
      this.logger.debug(`Generated messageId: ${messageId}`);

      // Create promise for result
      const resultPromise = this._createTranslationPromise(messageId);
      
      // Prepare payload
      const payload = {
        text: selectedText,
        from: settings.SOURCE_LANGUAGE || 'auto',
        to: settings.TARGET_LANGUAGE || 'fa',
        provider: settings.TRANSLATION_API || 'google',
        messageId: messageId,
        mode: translationMode,
        options: { ...options }
      };

      this.logger.debug("Sending translation request", payload);

      // Send translation request
      browser.runtime.sendMessage({
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
      });

      // Wait for result
      const result = await resultPromise;
      
      if (!result?.translatedText) {
        throw new Error('Translation failed: No translated text received');
      }

      this.logger.operation("Translation completed successfully");
      return result;

    } catch (error) {
      this.logger.error("Translation failed:", error);
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
          
          if (message.data?.success === false && message.data?.error) {
            this.logger.error("Translation error received", message.data.error);
            const errorMessage = message.data.error.message || 'Translation failed';
            reject(new Error(errorMessage));
          } else if (message.data?.translatedText) {
            this.logger.operation("Translation success received");
            resolve({ translatedText: message.data.translatedText });
          } else {
            this.logger.error("Unexpected message data", message.data);
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
    request.reject(new Error('Translation cancelled'));
    
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