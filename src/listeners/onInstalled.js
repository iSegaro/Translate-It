// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { setupContextMenus } from "./onContextMenu.js";

Browser.runtime.onInstalled.addListener(async (details) => {
  logME(`[Translate-It!] 🌟 Success: ${details.reason}`);

  // Setup all context menus on installation or update
  await setupContextMenus();

  // --- Scenario 1: Fresh Installation ---
  if (details.reason === "install") {
    logME("[onInstalled] First installation detected.");
    const optionsUrl = Browser.runtime.getURL("html/options.html#languages");
    Browser.tabs.create({ url: optionsUrl });
  }

  // --- Scenario 2: Extension Update ---
  else if (details.reason === "update") {
    try {
      const manifest = Browser.runtime.getManifest();
      const version = manifest.version;
      const appName = (await getTranslationString("name")) || "Translate It!";
      const title =
        (await getTranslationString("notification_update_title")) ||
        "Extension Updated";
      let message =
        (await getTranslationString("notification_update_message")) ||
        `{appName} has been updated to version {version}. Click to see what's new.`;

      message = message
        .replace("{appName}", appName)
        .replace("{version}", version);

      // --- START: BROWSER-AWARE NOTIFICATION OPTIONS ---

      // Create a base options object with properties common to all browsers.
      const notificationOptions = {
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/extension_icon_128.png"),
        title: title,
        message: message,
      };

      // --- Clear any existing notification with the same ID before creating a new one ---
      await Browser.notifications.clear("update-notification");
      
      // --- END: BROWSER-AWARE NOTIFICATION OPTIONS ---

      // Create the notification using the compatible options object.
      await Browser.notifications.create(
        "update-notification",
        notificationOptions
      );
      logME("[onInstalled] Update notification created with browser-specific options.");
    } catch (e) {
      // This will now only catch unexpected errors, not the compatibility error.
      logME("[onInstalled] Failed to create update notification:", e);
    }
  }
});
