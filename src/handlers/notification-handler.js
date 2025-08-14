/**
 * Notification Handler - Unified handler for notifications.onClicked events
 * Handles browser notification clicks and actions
 */

import browser from "webextension-polyfill";

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'notification-handler');
  }
  return _logger;
};

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';


/**
 * Handle update notification click
 */
async function handleUpdateNotification() {
  try {
    getLogger().debug('Update notification clicked');

    // Open options page to show changelog/about
    const optionsUrl = browser.runtime.getURL("options.html#about");

    // Check if options page is already open
    const tabs = await browser.tabs.query({ url: optionsUrl });

    if (tabs.length > 0) {
      // Focus existing tab
      await browser.tabs.update(tabs[0].id, { active: true });
      await browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      // Create new tab
      await browser.tabs.create({ url: optionsUrl });
    }

    // Clear the notification
    await browser.notifications.clear("update-notification");

    getLogger().debug('Update notification handled - opened options page',  );
  } catch (error) {
    getLogger().error('Error handling update notification:', error);
  }
}

/**
 * Handle migration success notification click
 */
async function handleMigrationNotification() {
  try {
    getLogger().debug('Migration notification clicked');

    // Open options page to show settings
    const optionsUrl = browser.runtime.getURL("options.html");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("migration-success");

    getLogger().debug('Migration notification handled - opened options page',  );
  } catch (error) {
    getLogger().error('Error handling migration notification:', error,
    );
  }
}

/**
 * Handle provider change notification click
 */
async function handleProviderChangeNotification() {
  try {
    getLogger().debug('Provider change notification clicked');

    // Open options page to API settings
    const optionsUrl = browser.runtime.getURL("options.html#api");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("provider-changed");

    getLogger().debug('Provider change notification handled - opened API settings',  );
  } catch (error) {
    getLogger().error('Error handling provider change notification:', error,
    );
  }
}

/**
 * Handle site exclusion notification click
 */
async function handleSiteExclusionNotification() {
  try {
    getLogger().debug('Site exclusion notification clicked');

    // Open options page to advanced settings
    const optionsUrl = browser.runtime.getURL("options.html#advance");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("site-excluded");

    getLogger().debug('Site exclusion notification handled - opened advanced settings',  );
  } catch (error) {
    getLogger().error('Error handling site exclusion notification:', error,
    );
  }
}

/**
 * Handle site inclusion notification click
 */
async function handleSiteInclusionNotification() {
  try {
    getLogger().debug('Site inclusion notification clicked');

    // Open options page to advanced settings
    const optionsUrl = browser.runtime.getURL("options.html#advance");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("site-included");

    getLogger().debug('Site inclusion notification handled - opened advanced settings',  );
  } catch (error) {
    getLogger().error('Error handling site inclusion notification:', error,
    );
  }
}

/**
 * Handle translation error notification click
 */
async function handleTranslationErrorNotification() {
  try {
    getLogger().error('Translation error notification clicked');

    // Open options page to API settings for troubleshooting
    const optionsUrl = browser.runtime.getURL("options.html#api");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("translation-error");

    getLogger().error('Translation error notification handled - opened API settings',  );
  } catch (error) {
    getLogger().error('Error handling translation error notification:', error,
    );
  }
}

/**
 * Handle generic success notification click
 */
async function handleSuccessNotification(notificationId) {
  try {
    getLogger().init('Success notification clicked: ${notificationId}',  );

    // Just clear the notification
    await browser.notifications.clear(notificationId);

    getLogger().init('Success notification ${notificationId} cleared',  );
  } catch (error) {
    getLogger().init('Error handling success notification:', error);
  }
}

/**
 * Handle error notification click
 */
async function handleErrorNotification(notificationId) {
  try {
    getLogger().error('Error notification clicked: ${notificationId}',  );

    // Open options page for help/troubleshooting
    const optionsUrl = browser.runtime.getURL("options.html#help");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear(notificationId);

    getLogger().error('Error notification ${notificationId} handled - opened help page',  );
  } catch (error) {
    getLogger().error('Error handling error notification:', error);
  }
}

/**
 * Handle TTS notification click
 */
async function handleTTSNotification() {
  try {
    getLogger().debug('TTS notification clicked');

    // Open sidepanel if available
    try {
      const windows = await browser.windows.getAll({ focused: true });
      if (windows.length > 0 && browser.sidePanel && browser.sidePanel.open) {
        await browser.sidePanel.open({ windowId: windows[0].id });
        getLogger().debug('Opened sidepanel for TTS');
      } else {
        // Fallback to popup
        await browser.action.openPopup();
        getLogger().debug('Opened popup for TTS');
      }
    } catch {
      // If sidepanel/popup fails, open options page
      const optionsUrl = browser.runtime.getURL("options.html");
      await browser.tabs.create({ url: optionsUrl });
      getLogger().debug('Opened options page as TTS fallback');
    }

    // Clear TTS-related notifications
    await browser.notifications.clear("tts-started");
    await browser.notifications.clear("tts-completed");
    await browser.notifications.clear("tts-error");

    getLogger().debug('TTS notification handled');
  } catch (error) {
    getLogger().error('Error handling TTS notification:', error);
  }
}

/**
 * Main notification event handler
 */
export async function handleNotificationEvent(notificationId) {
  getLogger().debug('Notification clicked: ${notificationId}');

  try {
    // Handle specific notification types
    switch (notificationId) {
      case "update-notification":
        await handleUpdateNotification();
        break;

      case "migration-success":
        await handleMigrationNotification();
        break;

      case "provider-changed":
        await handleProviderChangeNotification();
        break;

      case "site-excluded":
        await handleSiteExclusionNotification();
        break;

      case "site-included":
        await handleSiteInclusionNotification();
        break;

      case "translation-error":
        await handleTranslationErrorNotification();
        break;

      case "tts-started":
      case "tts-completed":
      case "tts-error":
        await handleTTSNotification();
        break;

      default:
        // Handle generic notifications based on naming patterns
        if (notificationId.includes("success")) {
          await handleSuccessNotification(notificationId);
        } else if (
          notificationId.includes("error") ||
          notificationId.includes("failed")
        ) {
          await handleErrorNotification(notificationId);
        } else {
          // Unknown notification - just clear it
          getLogger().debug('Unknown notification: ${notificationId}, clearing',  );
          await browser.notifications.clear(notificationId);
        }
        break;
    }

    getLogger().init('Notification ${notificationId} handled successfully',  );
  } catch (error) {
    getLogger().error('Error handling notification ${notificationId}:', error,
    );
    throw error;
  }
}
