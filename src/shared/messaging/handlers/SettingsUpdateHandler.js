/**
 * Handles settings update messages from the options page
 */

import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'SettingsUpdateHandler')

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
