// src/composables/useDirectMessage.js
// Direct message sending without complex wrappers for debugging

import { ref } from "vue";
import browser from "webextension-polyfill";
import { MessageActions } from "@/messaging/core/MessageActions.js";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('UI', 'useDirectMessage');

export function useDirectMessage() {
  const isReady = ref(false);

  /**
   * Direct message sending for debugging
   */
  const directSendMessage = async (message) => {
    try {
      if (!browser || !browser.runtime) {
        throw new Error("browser API not available");
      }

      logger.debug("Sending direct message:", message);

      // Direct call without Promise.race or timeout wrapper
      const response = await browser.runtime.sendMessage(message);

      logger.debug("Direct response received:", response);
      return response;
    } catch (error) {
      logger.error("Direct message failed", error);

      // Return a simple error object
      return {
        success: false,
        error: "Direct message failed: " + error.message,
        _isConnectionError: true,
      };
    }
  };

  /**
   * Send translation message with minimal wrapping
   */
  const sendTranslation = async (payload, abortSignal) => {
    logger.debug("Sending translation with payload:", payload);

    // Check if request was cancelled before starting
    if (abortSignal?.aborted) {
      throw new Error("Request was cancelled before sending");
    }

    const message = {
      action: MessageActions.FETCH_TRANSLATION,
      target: "background", // Explicitly target background service worker
      payload: payload,
    };

    // If abort signal provided, race the request against cancellation
    if (abortSignal) {
      return new Promise((resolve, reject) => {
        // Set up abort handler
        const abortHandler = () => {
          const abortError = new Error("Request cancelled");
          abortError.name = "AbortError";
          reject(abortError);
        };

        if (abortSignal.aborted) {
          abortHandler();
          return;
        }

        abortSignal.addEventListener("abort", abortHandler);

        // Send the actual request
        directSendMessage(message)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            abortSignal.removeEventListener("abort", abortHandler);
          });
      });
    }

    return await directSendMessage(message);
  };

  return {
    isReady,
    directSendMessage,
    sendTranslation,
  };
}
