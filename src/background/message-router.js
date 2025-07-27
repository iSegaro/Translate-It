// src/background/message-router.js
import { ErrorHandler } from '../error-management/ErrorHandler.js';
import { ErrorTypes } from '../error-management/ErrorTypes.js';

class MessageRouter {
  constructor() {
    this.handlers = new Map();
    this.errorHandler = new ErrorHandler(); // Initialize error handler
  }

  /**
   * Registers a handler function for a specific message action.
   * @param {string} action - The message action string (e.g., 'TRANSLATE', 'ping').
   * @param {Function} handlerFunction - The function to call when this action is received.
   *   It should accept (message, sender, sendResponse) as arguments.
   */
  registerHandler(action, handlerFunction) {
    if (this.handlers.has(action)) {
      console.warn(`⚠️ MessageRouter: Handler for action "${action}" already registered. Overwriting.`);
    }
    this.handlers.set(action, handlerFunction);
    console.log(`✅ MessageRouter: Registered handler for action: "${action}"`);
  }

  /**
   * Routes an incoming message to the appropriate registered handler.
   * Catches and reports errors from handlers.
   * @param {Object} message - The message object.
   * @param {Object} sender - The sender object.
   * @param {Function} sendResponse - The function to send a response back.
   * @returns {boolean|undefined} - Returns true if sendResponse will be called asynchronously,
   *   false if handled synchronously, or undefined if no handler is found.
   */
  async routeMessage(message, sender, sendResponse) {
    const timestamp = Date.now();
    const messageId = `${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
    
    console.log(`[MessageRouter:${messageId}] ═══ ROUTING MESSAGE ═══`);
    console.log(`[MessageRouter:${messageId}] Message:`, JSON.stringify(message, null, 2));
    console.log(`[MessageRouter:${messageId}] Sender:`, sender);
    console.log(`[MessageRouter:${messageId}] SendResponse type:`, typeof sendResponse);
    
    const action = message?.action || message?.type;
    if (!action) {
      console.error(`[MessageRouter:${messageId}] ❌ Message missing 'action' or 'type'`);
      this.errorHandler.handle(new Error("Message missing 'action' or 'type'"), {
        type: ErrorTypes.MESSAGE_ROUTING,
        context: "MessageRouter",
        messageData: message
      });
      const errorResponse = { success: false, error: "Missing action/type." };
      console.log(`[MessageRouter:${messageId}] Sending error response:`, errorResponse);
      sendResponse(errorResponse);
      return false;
    }

    console.log(`[MessageRouter:${messageId}] Action detected: "${action}"`);
    
    const handler = this.handlers.get(action);
    if (!handler) {
      console.warn(`[MessageRouter:${messageId}] ⚠️ No handler registered for action: "${action}"`);
      console.log(`[MessageRouter:${messageId}] Available handlers:`, Array.from(this.handlers.keys()));
      // No handler, so no async response expected from this router.
      // Let other listeners (if any) handle it, or let it fall through.
      return undefined; // Or false, depending on desired fallback behavior. Undefined is safer.
    }

    console.log(`[MessageRouter:${messageId}] ✅ Handler found for action: "${action}"`);
    
    try {
      // Handlers are expected to return true for async responses, or a direct response.
      console.log(`[MessageRouter:${messageId}] 🔄 Calling handler for action: ${action}`);
      const startTime = Date.now();
      const result = await Promise.resolve(handler(message, sender, sendResponse));
      const endTime = Date.now();
      
      console.log(`[MessageRouter:${messageId}] ⏱️ Handler execution time: ${endTime - startTime}ms`);
      console.log(`[MessageRouter:${messageId}] 📤 Handler returned:`, JSON.stringify(result, null, 2));

      // Handler response interpretation:
      // - true: Handler will call sendResponse asynchronously
      // - false: Handler already called sendResponse synchronously
      // - undefined/null: Handler didn't handle the message
      // - object: Handler wants router to send this response
      
      if (result === true) {
        console.log(`[MessageRouter:${messageId}] 🔄 Handler will respond asynchronously - keeping channel open`);
        return true; // Keep async channel open for handler
      } else if (result === false) {
        console.log(`[MessageRouter:${messageId}] ✅ Handler already sent response synchronously`);
        return false; // Handler handled response, channel can close
      } else if (result !== undefined && result !== null) {
        console.log(`[MessageRouter:${messageId}] 📨 Router sending result from handler:`, JSON.stringify(result, null, 2));
        sendResponse(result);
        console.log(`[MessageRouter:${messageId}] ✅ Response sent via router`);
        return false; // Response sent synchronously by router
      } else {
        console.log(`[MessageRouter:${messageId}] ⚠️ Handler returned undefined/null, no response sent`);
        return undefined; // Let other listeners handle if any
      }
      
    } catch (error) {
      console.error(`[MessageRouter:${messageId}] ❌ Handler error:`, error);
      console.error(`[MessageRouter:${messageId}] ❌ Error stack:`, error.stack);
      
      this.errorHandler.handle(error, {
        type: ErrorTypes.MESSAGE_HANDLER,
        context: `Handler for ${action}`,
        messageData: message
      });
      
      // Attempt to send an error response if possible and not already sent by handler
      if (typeof sendResponse === 'function') {
        const errorResponse = { success: false, error: error.message || `Error processing action: ${action}` };
        console.log(`[MessageRouter:${messageId}] 📨 Sending error response:`, JSON.stringify(errorResponse, null, 2));
        sendResponse(errorResponse);
      }
      
      console.log(`[MessageRouter:${messageId}] ❌ Error handled, returning false`);
      return false; // Error handled, no async response expected from handler
    }
  }
}

export { MessageRouter };
export const messageRouter = new MessageRouter();
