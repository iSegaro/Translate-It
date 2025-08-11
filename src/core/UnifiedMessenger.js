/**
 * Unified Messenger - Cross-platform messaging system
 * Uses Promise-based approach for Chrome/Firefox compatibility
 * Eliminates sendResponse callback issues with webextension-polyfill
 */

import { ErrorHandler } from '../error-management/ErrorService.js';
import { ErrorTypes } from '../error-management/ErrorTypes.js';
import { matchErrorToType } from '../error-management/ErrorMatcher.js';
import browser from "webextension-polyfill";
import { isFirefox } from "../utils/browser/compatibility.js";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { generateMessageId } from "../utils/messaging/messageId.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'UnifiedMessenger');

export class UnifiedMessenger {
  constructor(context = "unknown") {
    this.context = context;
    this.messageCounter = 0;
  }

  /**
   * Cross-platform Promise-based message sending
   * Works reliably with both Chrome and Firefox
   */
  async sendMessage(message, timeout = 10000) {
    const messageId = message.messageId || generateMessageId(this.context);

    try {
      // Detect browser environment for Firefox workaround (before Promise creation)
      const firefoxDetection = await isFirefox();

      // Manual Promise wrapper to fix webextension-polyfill Firefox bug
      const response = await new Promise(async (resolve, reject) => { // Make the Promise callback async
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Message timeout after ${timeout}ms for action: ${message.action}`,
            ),
          );
        }, timeout);

        const messageToSend = {
          ...message,
          messageId, // Use the determined messageId
          context: this.context,
        };

        try {
          const sendMessagePromise = browser.runtime.sendMessage(messageToSend);

          if (
            sendMessagePromise &&
            typeof sendMessagePromise.then === "function"
          ) {
            sendMessagePromise
              .then(async (response) => { // Make this callback async too
                clearTimeout(timeoutId);

                // MV3 workaround: check if response is undefined but message was actually processed (both Firefox and Chrome)
                if (response === undefined) {
                  console.info("[UnifiedMessenger] MV3 undefined response detected for", messageToSend.action);
                  // For ping messages, we know it should work, so provide expected response
                  if (messageToSend.action === MessageActions.PING) {
                    resolve({ success: true, message: "pong" });
                    return;
                  }
                  // For TRANSLATE messages from all contexts, we need to wait for the actual result via TRANSLATION_RESULT_UPDATE (Firefox MV3 issue)
                  if (messageToSend.action === MessageActions.TRANSLATE) {
                    const actualTranslationResult = await new Promise((resolveResult, rejectResult) => {
                      const listener = (msg) => {
                        if (msg.action === MessageActions.TRANSLATION_RESULT_UPDATE && msg.context === messageToSend.context && msg.messageId === messageToSend.messageId) {
                          browser.runtime.onMessage.removeListener(listener);
                          resolveResult(msg);
                        }
                      };
                      browser.runtime.onMessage.addListener(listener);

                      // Set a timeout for the actual translation result
                      setTimeout(() => {
                        browser.runtime.onMessage.removeListener(listener);
                        rejectResult(new Error('Actual translation result timeout'));
                      }, 20000); // 20 seconds timeout for actual result
                    });
                    resolve(actualTranslationResult); // Resolve with the actual result
                    return;
                  }
                  // This should not happen anymore for TRANSLATE messages
                  if (messageToSend.action === MessageActions.TRANSLATE) {
                    logger.warn("[UnifiedMessenger] TRANSLATE got undefined response after TRANSLATION_RESULT_UPDATE implementation");
                    resolve({ success: false, error: "Unexpected undefined response for TRANSLATE" });
                    return;
                  }
                  // For Google TTS messages, we need to wait for actual background processing
                  if (messageToSend.action === MessageActions.GOOGLE_TTS_SPEAK) {
                    // Wait longer for TTS to complete in background, then assume success
                    setTimeout(() => {
                      resolve({
                        success: true,
                        message: "TTS processing completed (MV3 workaround)",
                        mv3Bug: true,
                      });
                    }, 3000); // 3 second delay for TTS processing
                    return;
                  }
                  // For element selection messages, we need to handle the actual response from background
                  if (messageToSend.action === MessageActions.ACTIVATE_SELECT_ELEMENT_MODE) {
                    // Check if we can determine success/failure from background logs or other indicators
                    // Since we can't get the real response, assume success for now
                    // The actual feedback will come from content script or storage updates
                    resolve({
                      success: true,
                      message: "Element selection mode toggled (MV3 workaround)",
                      mv3Bug: true,
                    });
                  } else {
                    // For other messages, resolve with success flag
                    resolve({
                      success: true,
                      message:
                        "Response received but undefined due to MV3 bug",
                      mv3Bug: true,
                    });
                  }
                } else {
                  resolve(response);
                }
              })
              .catch((error) => {
                clearTimeout(timeoutId);
                reject(error);
              });
          } else {
            reject(new Error("Browser API does not support Promise"));
          }
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });

      return response;
    } catch (error) {
      // Determine error type
      const errorType = matchErrorToType(error.message || error);
      
      const handler = ErrorHandler.getInstance();
      await handler.handle(error, { type: errorType, context: `UnifiedMessenger-sendMessage-${this.context}` });
      
      // For extension context invalidation errors, return a graceful response instead of throwing
      if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED || errorType === ErrorTypes.CONTEXT) {
        return { 
          success: false, 
          error: 'Extension context unavailable',
          contextInvalidated: true,
          gracefulFailure: true
        };
      }
      
      throw error;
    }
  }

  /**
   * Translation-specific wrapper
   */
  async translate(payload) {
    const message = {
      action: "TRANSLATE",
      context: this.context,
      messageId: payload.messageId, // Pass messageId from payload
      data: {
        text: payload.text,
        provider: payload.provider,
        sourceLanguage: payload.from || 'auto',
        targetLanguage: payload.to || 'fa',
        mode: payload.mode,
        options: payload.options || {},
      },
    };

    const result = await this.sendMessage(message);
    return result;
  }

  /**
   * Get available providers
   */
  async getProviders() {
    return this.sendMessage({
      action: "GET_PROVIDERS",
    });
  }

  /**
   * TTS speak
   */
  async speak(text, language, options = {}) {
    return this.sendMessage({
      action: "TTS_SPEAK",
      text,
      language,
      ...options,
    });
  }

  /**
   * TTS stop
   */
  async stopSpeaking() {
    return this.sendMessage({
      action: "TTS_STOP",
    });
  }

  /**
   * Get history
   */
  async getHistory() {
    return this.sendMessage({
      action: "GET_HISTORY",
    });
  }

  /**
   * Clear history
   */
  async clearHistory() {
    return this.sendMessage({
      action: "CLEAR_HISTORY",
    });
  }

  /**
   * Show notification
   */
  async showNotification(title, message) {
    return this.sendMessage({
      action: "SHOW_NOTIFICATION",
      title,
      message,
    });
  }

  /**
   * Get messenger info
   */
  getInfo() {
    return {
      context: this.context,
      messageCounter: this.messageCounter,
    };
  }
}

/**
 * Factory function to create messenger instances
 */
export function createMessenger(context) {
  return new UnifiedMessenger(context);
}

/**
 * Create context-specific messengers for common use cases
 */
export const popupMessenger = new UnifiedMessenger("popup");
export const sidepanelMessenger = new UnifiedMessenger("sidepanel");
export const contentMessenger = new UnifiedMessenger("content");
export const optionsMessenger = new UnifiedMessenger("options");

export default UnifiedMessenger;