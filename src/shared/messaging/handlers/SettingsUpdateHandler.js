/**
 * Handles settings update messages from the options page
 */

import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'
import { settingsManager } from '@/shared/managers/SettingsManager.js'

const logger = getScopedLogger(LOG_COMPONENTS.MESSAGING, 'SettingsUpdateHandler')

export class SettingsUpdateHandler {
  constructor() {
    this.setupMessageListener()
  }

  setupMessageListener() {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      logger.debug('Chrome runtime not available, skipping settings update handler')
      return
    }

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'SETTINGS_UPDATED') {
        logger.debug('Received settings update notification from options page')

        // Refresh settings
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

// Export singleton instance
export const settingsUpdateHandler = new SettingsUpdateHandler()

export default settingsUpdateHandler