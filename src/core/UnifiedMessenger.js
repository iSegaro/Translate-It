/**
 * Unified Messenger - Cross-platform messaging system
 * Uses Promise-based approach for Chrome/Firefox compatibility
 * Eliminates sendResponse callback issues with webextension-polyfill
 */

import browser from "webextension-polyfill";

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
    const messageId = message.messageId || `${this.context}-${++this.messageCounter}-${Date.now()}`;

    try {

      // Manual Promise wrapper to fix webextension-polyfill Firefox bug
      const response = await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(
            new Error(
              `Message timeout after ${timeout}ms for action: ${message.action}`,
            ),
          );
        }, timeout);

        // Detect browser environment for Firefox workaround
        const isFirefox = typeof InstallTrigger !== "undefined";

        const messageToSend = {
          ...message,
          messageId, // Use the determined messageId
          context: this.context,
        };

        // Use webextension-polyfill for all browsers to ensure consistent behavior

        try {
          const sendMessagePromise = browser.runtime.sendMessage(messageToSend);

          if (
            sendMessagePromise &&
            typeof sendMessagePromise.then === "function"
          ) {
            sendMessagePromise
              .then((response) => {
                clearTimeout(timeoutId);

                // Firefox MV3 workaround: check if response is undefined but message was actually processed
                if (response === undefined && isFirefox) {
                  console.warn("[UnifiedMessenger] Firefox MV3 undefined response detected for", messageToSend.action);
                  // For ping messages, we know it should work, so provide expected response
                  if (messageToSend.action === "ping") {
                    resolve({ success: true, message: "pong" });
                    return;
                  }
                  // For TRANSLATE messages from all contexts, we need to wait for the actual result via TRANSLATION_RESULT_UPDATE (Firefox MV3 issue)
                  if (messageToSend.action === "TRANSLATE") {
                    // Create a promise that resolves when the TRANSLATION_RESULT_UPDATE message is received
                    const actualTranslationResultPromise = new Promise((resolveResult, rejectResult) => {
                      const listener = (msg) => {
                        if (msg.action === 'TRANSLATION_RESULT_UPDATE' && msg.context === messageToSend.context && msg.messageId === messageToSend.messageId) {
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
                    resolve(actualTranslationResultPromise); // Resolve the outer promise with the inner promise
                    return;
                  }
                  // This should not happen anymore for TRANSLATE messages
                  if (messageToSend.action === "TRANSLATE") {
                    console.warn("[UnifiedMessenger] TRANSLATE got undefined response after TRANSLATION_RESULT_UPDATE implementation");
                    resolve({ success: false, error: "Unexpected undefined response for TRANSLATE" });
                    return;
                  }
                  // For element selection messages, we need to handle the actual response from background
                  if (messageToSend.action === "activateSelectElementMode") {
                    // Check if we can determine success/failure from background logs or other indicators
                    // Since we can't get the real response, assume success for now
                    // The actual feedback will come from content script or storage updates
                    resolve({
                      success: true,
                      message: "Element selection mode toggled (Firefox MV3 workaround)",
                      firefoxBug: true,
                    });
                  } else {
                    // For other messages, resolve with success flag
                    resolve({
                      success: true,
                      message:
                        "Response received but undefined due to Firefox MV3 bug",
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
      console.error(
        `[UnifiedMessenger:${this.context}] ❌ Message error:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Translation-specific wrapper
   */
  async translate(payload) {
    // Format message according to translation-protocol.js standard
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
