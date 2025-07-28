// src/listeners/onMessage.js
// Cross-browser message listener with base listener architecture

import browser from 'webextension-polyfill';
import { BaseListener } from "./base-listener.js";
import { logME } from "../utils/helpers.js";

/**
 * Message Listener Class
 * Handles all runtime message events with proper error isolation
 */
class MessageListener extends BaseListener {
  constructor() {
    super("runtime", "onMessage", "Message Listener");
  }

  async initialize() {
    await super.initialize();
  }

  /**
   * Override the base listener's register method to properly handle Chrome extension message listeners
   */
  async register() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.isRegistered) {
      console.log(`🔄 ${this.listenerName} listener already registered`);
      return;
    }

    try {
      if (!browser) {
        throw new Error(`browser API not available`);
      }

      const eventObject = browser.runtime.onMessage;
      if (!eventObject) {
        throw new Error(`Event onMessage not available on runtime`);
      }

      // webextension-polyfill handles cross-browser compatibility automatically
      eventObject.addListener((message, sender, sendResponse) => {
        console.debug(
          `📨 ${this.listenerName} event received, forwarding to central router.`
        );

        if (
          globalThis.backgroundService &&
          typeof globalThis.backgroundService.handleCentralMessageWrapper ===
            "function"
        ) {
          // Let webextension-polyfill handle the cross-browser differences
          return globalThis.backgroundService.handleCentralMessageWrapper(
            message,
            sender,
            sendResponse
          );
        } else {
          console.error(
            "[onMessage] BackgroundService not available or not initialized. Cannot forward message:",
            message
          );
          sendResponse({
            success: false,
            error: "Background service not ready.",
          });
          return false;
        }
      });

      this.isRegistered = true;
      console.log(`✅ Registered ${this.listenerName} listener`);
    } catch (error) {
      console.error(
        `❌ Failed to register ${this.listenerName} listener:`,
        error
      );
      throw error;
    }
  }
}
