/**
 * Handles settings update messages from the options page
 */

import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { MessageActions } from '@/shared/messaging/core/MessageActions.js'

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'SettingsUpdateHandler')

export class SettingsUpdateHandler {
  constructor() {
    this.setupMessageListener()
  }

  setupMessageListener() {
    // Use cross-browser compatible runtime access
    if (!ExtensionContextManager.isValidSync()) {
      logger.debug('Extension context not available, skipping settings update handler')
      return
    }

    const browser = globalThis.browser || globalThis.chrome
    if (!browser?.runtime) {
      logger.debug('Runtime API not available, skipping settings update handler')
      return
    }

    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Support both legacy 'type' and unified 'action' formats for backward compatibility
      const isSettingsUpdate = message.type === MessageActions.SETTINGS_UPDATED ||
                              message.action === MessageActions.SETTINGS_UPDATED

      if (isSettingsUpdate) {
        logger.debug('Received settings update notification from options page')

        // Refresh settings asynchronously
        settingsManager.refreshSettings().then(() => {
          logger.debug('Settings refreshed after receiving update notification')
        }).catch(error => {
          logger.error('Error refreshing settings after update notification:', error)
        })

        // Return true to indicate we handled this message
        return true
      }

      // Return false to allow other listeners to handle the message
      return false
    })

    logger.debug('Settings update message listener setup complete')
  }
}

/**
 * Handle SETTINGS_UPDATED message for background message routing
 * @param {Object} message - The message object
 * @param {Object} sender - Message sender information
 * @param {Function} sendResponse - Response callback function
 * @returns {boolean} True if message was handled
 */
export async function handleSettingsUpdated(message, sender, sendResponse) {
  logger.debug('Received SETTINGS_UPDATED message via background handler')

  try {
    // Refresh settings asynchronously
    await settingsManager.refreshSettings()
    logger.debug('Settings refreshed after receiving SETTINGS_UPDATED message')

    // Send success response
    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse({ success: true, message: 'Settings updated successfully' })
    }

    return true
  } catch (error) {
    logger.error('Error handling SETTINGS_UPDATED message:', error)

    // Send error response
    if (sendResponse && typeof sendResponse === 'function') {
      sendResponse({
        success: false,
        error: error.message || 'Failed to update settings'
      })
    }

    return true
  }
}

// Export singleton instance
export const settingsUpdateHandler = new SettingsUpdateHandler()

export default settingsUpdateHandler