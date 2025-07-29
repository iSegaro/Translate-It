// src/background/message-router.js
import { ErrorHandler } from "../error-management/ErrorHandler.js";
import { ErrorTypes } from "../error-management/ErrorTypes.js";

class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.errorHandler = new ErrorHandler(); // Initialize error handler
  }

  /**
   * Registers a handler function for a specific message action.
   * @param {string} action - The message action string (e.g., 'TRANSLATE', 'ping').
   * @param {Function} handlerFunction - The function to call when this action is received.
   *   It should accept (message, sender) as arguments.
   */
  registerHandler(action, handlerFunction) {
    if (this.handlers.has(action)) {
      console.warn(
        `⚠️ MessageRouter: Handler for action "${action}" already registered. Overwriting.`,
      );
    }
    this.handlers.set(action, handlerFunction);
    console.log(`✅ MessageRouter: Registered handler for action: "${action}"`);
  }

  /**
   * Routes an incoming message to the appropriate registered handler.
   * Catches and reports errors from handlers.
   * @param {Object} message - The message object.
   * @param {Object} sender - The sender object.
   * @returns {Promise<any>|undefined} - A Promise that resolves with the handler's result, or undefined if no handler is found.
   */
  async routeMessage(message, sender) {
    const timestamp = Date.now();
    const messageId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`[MessageRouter:${messageId}] ═══ ROUTING MESSAGE ═══`);
    console.log(
      `[MessageRouter:${messageId}] Message:`,
      JSON.stringify(message, null, 2),
    );
    console.log(`[MessageRouter:${messageId}] Sender:`, sender);

    const action = message?.action || message?.type;
    if (!action) {
      console.error(
        `[MessageRouter:${messageId}] ❌ Message missing 'action' or 'type'`,
      );
      this.errorHandler.handle(
        new Error("Message missing 'action' or 'type'"),
        {
          type: ErrorTypes.MESSAGE_ROUTING,
          context: "MessageRouter",
          messageData: message,
        },
      );
      const errorResponse = { success: false, error: "Missing action/type." };
      console.log(
        `[MessageRouter:${messageId}] Sending error response:`,
        errorResponse,
      );
      return errorResponse; // Return error response for consistency
    }

    console.log(`[MessageRouter:${messageId}] Action detected: "${action}"`);

    const handler = this.handlers.get(action);
    if (!handler) {
      console.warn(
        `[MessageRouter:${messageId}] ⚠️ No handler registered for action: "${action}"`,
      );
      console.log(
        `[MessageRouter:${messageId}] Available handlers:`,
        Array.from(this.handlers.keys()),
      );
      return undefined; // No handler, let other listeners handle it
    }

    console.log(
      `[MessageRouter:${messageId}] ✅ Handler found for action: "${action}"`,
    );

    try {
      console.log(
        `[MessageRouter:${messageId}] 🔄 Calling handler for action: ${action}`,
      );
      const startTime = Date.now();

      // Await the handler's result. If the handler is async, this will await its Promise.
      // If the handler is synchronous, it will resolve immediately.
      const handlerResult = await handler(message, sender);

      const endTime = Date.now();
      console.log(
        `[MessageRouter:${messageId}] ⏱️ Async handler execution time: ${endTime - startTime}ms`,
      );

      // Return the handler's result directly. webextension-polyfill will use this to send the response.
      return handlerResult;
    } catch (error) {
      console.error(`[MessageRouter:${messageId}] ❌ Handler error:`, error);
      console.error(
        `[MessageRouter:${messageId}] ❌ Error stack:`,
        error.stack,
      );

      this.errorHandler.handle(error, {
        type: ErrorTypes.MESSAGE_HANDLER,
        context: `Handler for ${action}`,
        messageData: message,
      });

      const errorResponse = {
        success: false,
        error: error.message || `Error processing action: ${action}`,
      };
      console.log(
        `[MessageRouter:${messageId}] 📨 Sending error response:`,
        JSON.stringify(errorResponse, null, 2),
      );
      return errorResponse; // Return error response
    }
  }
}

export { MessageRouter };
export const messageRouter = new MessageRouter();
