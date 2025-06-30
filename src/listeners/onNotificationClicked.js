// src/listeners/onNotificationClicked.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";

/**
 * Handles clicks on notifications created by the extension.
 */
Browser.notifications.onClicked.addListener((notificationId) => {
  // Check if the clicked notification is the one for updates
  if (notificationId === "update-notification") {
    logME("Update notification clicked. Opening options page to #about.");
    const changelogUrl = Browser.runtime.getURL("html/options.html#about");
    
    // Create the tab
    Browser.tabs.create({ url: changelogUrl });
    
    // Clear the notification after it has been clicked
    Browser.notifications.clear(notificationId);
  }
});

logME("[NotificationClicked] Listener is active.");