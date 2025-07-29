/**
 * Simple Message Handler - Promise-based cross-browser implementation.
 * Uses webextension-polyfill Promise API for seamless Chrome/Firefox compatibility.
 */
import browser from "webextension-polyfill";

class SimpleMessageHandler {
  constructor() {
    this.handlers = new Map();
    this.initialized = false;
  }

  /**
   * Initializes the message handler and registers the listener.
   * This is the core of the cross-browser compatibility.
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    console.log("🎧 Initializing Simple Message Handler...");

    // Use webextension-polyfill Promise-based listener for cross-browser compatibility
    browser.runtime.onMessage.addListener(async (message, sender) => {
      console.log(
        "[SimpleMessageHandler] 🎯 Received message:",
        message,
        "from:",
        sender,
      );

      try {
        // Handle message and return response directly (Promise-based)
        const response = await this.handleMessage(message, sender);
        console.log("[SimpleMessageHandler] 🚀 Response generated:", response);
        console.log(
          "[SimpleMessageHandler] 🚀 Response type:",
          typeof response,
        );
        console.log(
          "[SimpleMessageHandler] 🚀 Response is null?",
          response === null,
        );
        console.log(
          "[SimpleMessageHandler] 🚀 Response is undefined?",
          response === undefined,
        );
        console.log("[SimpleMessageHandler] 🚀 About to return:", response);
        return response;
      } catch (error) {
        console.error(
          "[SimpleMessageHandler] ❌ Error handling message:",
          error,
        );
        const errorResponse = { success: false, error: error.message };
        console.log("[SimpleMessageHandler] 🚀 Error response:", errorResponse);
        return errorResponse;
      }
    });

    this.initialized = true;
    console.log("✅ Simple Message Handler initialized successfully.");
  }

  /**
   * Registers a handler function for a specific message action.
   * @param {string} action - The name of the action to handle.
   * @param {Function} handlerFn - The async function to execute for this action.
   */
  registerHandler(action, handlerFn) {
    if (this.handlers.has(action)) {
      console.warn(
        `[SimpleMessageHandler] Overwriting handler for action: "${action}".`,
      );
    }
    this.handlers.set(action, handlerFn);
    // console.log(`✅ SimpleMessageHandler: Registered handler for "${action}"`);
  }

  /**
   * Processes an incoming message, finds the appropriate handler, and executes it.
   * @param {object} message - The message received.
   * @param {object} sender - The sender of the message.
   * @returns {Promise<any>} A promise that resolves with the handler's response.
   */
  async handleMessage(message, sender) {
    const action = message?.action || message?.type;

    if (!action) {
      console.error(
        "[SimpleMessageHandler] Message has no 'action' or 'type'.",
        message,
      );
      // Return a resolved promise with an error object, but don't throw
      return Promise.resolve({
        success: false,
        error: "Message must have a valid 'action' or 'type' property.",
      });
    }

    const handler = this.handlers.get(action);

    if (handler) {
      // console.log(`[SimpleMessageHandler] Executing handler for: ${action}`);
      return handler(message, sender); // Directly return the promise
    } else {
      // console.log(
      //   `[SimpleMessageHandler] No handler for action: ${action}. Passing to next listener.`
      // );
      // Return a resolved promise with undefined to indicate no handler was found
      return Promise.resolve(undefined);
    }
  }
}

// Export a singleton instance.
export const simpleMessageHandler = new SimpleMessageHandler();
