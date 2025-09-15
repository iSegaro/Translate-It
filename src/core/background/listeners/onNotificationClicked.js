/**
 * Notification Click Handler
 * Handles browser notification click events
 */

import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'notifications');

/**
 * Handle notification click events
 * @param {string} notificationId - The ID of the clicked notification
 */
export async function handleNotificationUpdateClick(notificationId) {
  try {
    switch (notificationId) {
      case "update-notification":
        // Open options page when update notification is clicked
        const optionsUrl = browser.runtime.getURL("html/options.html#about");
        await browser.tabs.create({ url: optionsUrl });

        // Clear the notification
        await browser.notifications.clear(notificationId);

        logger.debug('Options page opened from update notification');
        break;

      case "migration-success":
        // Open options page when migration notification is clicked
        const migrationOptionsUrl = browser.runtime.getURL("html/options.html#about");
        await browser.tabs.create({ url: migrationOptionsUrl });

        // Clear the notification
        await browser.notifications.clear(notificationId);

        logger.debug('Options page opened from migration notification');
        break;

      default:
        logger.debug(`Unhandled notification click: ${notificationId}`);
    }
  } catch (error) {
    logger.error('Failed to handle notification click:', error);
  }
}

// Register the notification click listener
browser.notifications.onClicked.addListener(handleNotificationUpdateClick);

logger.debug('Notification click listener registered');