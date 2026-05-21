import browser from 'webextension-polyfill';
import { MessageFormat } from './MessagingCore.js';
import { sendMessage } from './UnifiedMessaging.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'MessagingBus');

/**
 * MessagingBus - A high-level event bus for cross-context communication.
 * Simplifies sending messages and subscribing to updates.
 */
export class MessagingBus {
  /**
   * Sends a message to the background script.
   */
  static async sendToBackground(config) {
    const { action, payload, context, options } = config;
    const message = MessageFormat.create(action, payload, context);
    
    try {
      return await sendMessage(message, options);
    } catch (error) {
      logger.error(`Failed to send message ${action} to background:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Broadcasts a message to all contexts (tabs, popup, sidepanel).
   */
  static broadcast(config) {
    const { action, payload, context } = config;
    const message = MessageFormat.create(action, payload, context);
    
    // Broadcast to internal runtime
    browser.runtime.sendMessage(message).catch(() => {
      // Ignore errors when no listeners are active
    });

    // Broadcast to all tabs
    browser.tabs.query({}).then(tabs => {
      tabs.forEach(tab => {
        browser.tabs.sendMessage(tab.id, message).catch(() => {
          // Ignore errors for tabs without content scripts
        });
      });
    });
  }

  /**
   * Subscribes to messages in a specific context.
   */
  static subscribe(context, callback) {
    const listener = (message, sender) => {
      if (message.context === context) {
        return callback(message, sender);
      }
      return false;
    };

    browser.runtime.onMessage.addListener(listener);
    return () => browser.runtime.onMessage.removeListener(listener);
  }
}
