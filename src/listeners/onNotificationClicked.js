// src/listeners/onNotificationClicked.js
import browser from 'webextension-polyfill';
import { logME } from "../utils/helpers.js";

export async function initialize() {
  /**
   * Handles clicks on notifications created by the extension.
   */
  browser.notifications.onClicked.addListener((notificationId) => {
    // Check if the clicked notification is the one for updates
    if (notificationId === "update-notification") {
      logME("Update notification clicked. Opening options page to #about.");
      const changelogUrl = browser.runtime.getURL("html/options.html#about");
      
      // Create the tab
      browser.tabs.create({ url: changelogUrl });
      
      // Clear the notification after it has been clicked
      browser.notifications.clear(notificationId);
    }
  });

  logME("[NotificationClicked] Listener is active.");
}
