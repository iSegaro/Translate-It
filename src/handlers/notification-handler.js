/**
 * Notification Handler - Unified handler for notifications.onClicked events
 * Handles browser notification clicks and actions
 */

import browser from "webextension-polyfill";
import { logME } from "../utils/core/helpers.js";

/**
 * Handle update notification click
 */
async function handleUpdateNotification() {
  try {
    logME("[NotificationHandler] Update notification clicked");

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

    logME(
      "[NotificationHandler] Update notification handled - opened options page",
    );
  } catch (error) {
    logME("[NotificationHandler] Error handling update notification:", error);
  }
}

/**
 * Handle migration success notification click
 */
async function handleMigrationNotification() {
  try {
    logME("[NotificationHandler] Migration notification clicked");

    // Open options page to show settings
    const optionsUrl = browser.runtime.getURL("options.html");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("migration-success");

    logME(
      "[NotificationHandler] Migration notification handled - opened options page",
    );
  } catch (error) {
    logME(
      "[NotificationHandler] Error handling migration notification:",
      error,
    );
  }
}

/**
 * Handle provider change notification click
 */
async function handleProviderChangeNotification() {
  try {
    logME("[NotificationHandler] Provider change notification clicked");

    // Open options page to API settings
    const optionsUrl = browser.runtime.getURL("options.html#api");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("provider-changed");

    logME(
      "[NotificationHandler] Provider change notification handled - opened API settings",
    );
  } catch (error) {
    logME(
      "[NotificationHandler] Error handling provider change notification:",
      error,
    );
  }
}

/**
 * Handle site exclusion notification click
 */
async function handleSiteExclusionNotification() {
  try {
    logME("[NotificationHandler] Site exclusion notification clicked");

    // Open options page to advanced settings
    const optionsUrl = browser.runtime.getURL("options.html#advance");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("site-excluded");

    logME(
      "[NotificationHandler] Site exclusion notification handled - opened advanced settings",
    );
  } catch (error) {
    logME(
      "[NotificationHandler] Error handling site exclusion notification:",
      error,
    );
  }
}

/**
 * Handle site inclusion notification click
 */
async function handleSiteInclusionNotification() {
  try {
    logME("[NotificationHandler] Site inclusion notification clicked");

    // Open options page to advanced settings
    const optionsUrl = browser.runtime.getURL("options.html#advance");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("site-included");

    logME(
      "[NotificationHandler] Site inclusion notification handled - opened advanced settings",
    );
  } catch (error) {
    logME(
      "[NotificationHandler] Error handling site inclusion notification:",
      error,
    );
  }
}

/**
 * Handle translation error notification click
 */
async function handleTranslationErrorNotification() {
  try {
    logME("[NotificationHandler] Translation error notification clicked");

    // Open options page to API settings for troubleshooting
    const optionsUrl = browser.runtime.getURL("options.html#api");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear("translation-error");

    logME(
      "[NotificationHandler] Translation error notification handled - opened API settings",
    );
  } catch (error) {
    logME(
      "[NotificationHandler] Error handling translation error notification:",
      error,
    );
  }
}

/**
 * Handle generic success notification click
 */
async function handleSuccessNotification(notificationId) {
  try {
    logME(
      `[NotificationHandler] Success notification clicked: ${notificationId}`,
    );

    // Just clear the notification
    await browser.notifications.clear(notificationId);

    logME(
      `[NotificationHandler] Success notification ${notificationId} cleared`,
    );
  } catch (error) {
    logME("[NotificationHandler] Error handling success notification:", error);
  }
}

/**
 * Handle error notification click
 */
async function handleErrorNotification(notificationId) {
  try {
    logME(
      `[NotificationHandler] Error notification clicked: ${notificationId}`,
    );

    // Open options page for help/troubleshooting
    const optionsUrl = browser.runtime.getURL("options.html#help");
    await browser.tabs.create({ url: optionsUrl });

    // Clear the notification
    await browser.notifications.clear(notificationId);

    logME(
      `[NotificationHandler] Error notification ${notificationId} handled - opened help page`,
    );
  } catch (error) {
    logME("[NotificationHandler] Error handling error notification:", error);
  }
}

/**
 * Handle TTS notification click
 */
async function handleTTSNotification() {
  try {
    logME("[NotificationHandler] TTS notification clicked");

    // Open sidepanel if available
    try {
      const windows = await browser.windows.getAll({ focused: true });
      if (windows.length > 0 && browser.sidePanel && browser.sidePanel.open) {
        await browser.sidePanel.open({ windowId: windows[0].id });
        logME("[NotificationHandler] Opened sidepanel for TTS");
      } else {
        // Fallback to popup
        await browser.action.openPopup();
        logME("[NotificationHandler] Opened popup for TTS");
      }
    } catch {
      // If sidepanel/popup fails, open options page
      const optionsUrl = browser.runtime.getURL("options.html");
      await browser.tabs.create({ url: optionsUrl });
      logME("[NotificationHandler] Opened options page as TTS fallback");
    }

    // Clear TTS-related notifications
    await browser.notifications.clear("tts-started");
    await browser.notifications.clear("tts-completed");
    await browser.notifications.clear("tts-error");

    logME("[NotificationHandler] TTS notification handled");
  } catch (error) {
    logME("[NotificationHandler] Error handling TTS notification:", error);
  }
}

/**
 * Main notification event handler
 */
export async function handleNotificationEvent(notificationId) {
  logME(`[NotificationHandler] Notification clicked: ${notificationId}`);

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
          logME(
            `[NotificationHandler] Unknown notification: ${notificationId}, clearing`,
          );
          await browser.notifications.clear(notificationId);
        }
        break;
    }

    logME(
      `[NotificationHandler] Notification ${notificationId} handled successfully`,
    );
  } catch (error) {
    logME(
      `[NotificationHandler] Error handling notification ${notificationId}:`,
      error,
    );
    throw error;
  }
}
