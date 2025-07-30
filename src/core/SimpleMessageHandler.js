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

    // Use callback pattern for Firefox MV3 compatibility
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log(
        "[SimpleMessageHandler] 🎯 Received message:",
        message,
        "from:",
        sender,
      );

      // Check if we have a handler for this message
      const action = message?.action || message?.type;
      const handler = this.handlers.get(action);
      
      if (handler) {
        // Check if handler uses callback pattern (3+ parameters)
        if (handler.length >= 3) {
          console.log(`[SimpleMessageHandler] Using callback pattern for: ${action}`);
          // Call handler directly with callback - it will handle sendResponse
          handler(message, sender, sendResponse);
          return true; // Keep message channel open
        } else {
          console.log(`[SimpleMessageHandler] Using Promise pattern for: ${action}`);
          // For Promise-based handlers, return the Promise directly
          // The browser will wait for this Promise to resolve and send the response
          return handler(message, sender);
        }
      } else {
        console.log(`[SimpleMessageHandler] No handler for action: ${action}`);
        // No handler found - let other listeners handle it
        return false;
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
}

// Export a singleton instance.
export const simpleMessageHandler = new SimpleMessageHandler();
