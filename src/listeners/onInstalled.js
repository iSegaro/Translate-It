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
    logME("First installation detected. Opening options page to #api.");
    const optionsUrl = Browser.runtime.getURL("html/options.html#api");
    Browser.tabs.create({ url: optionsUrl });
  }
  
  // --- Scenario 2: Extension Update ---
  else if (details.reason === "update") {
    try {
      const manifest = Browser.runtime.getManifest();
      const version = manifest.version;
      const appName = (await getTranslationString("name")) || "Translate It!";
      const title = (await getTranslationString("notification_update_title")) || "Extension Updated";
      let message = (await getTranslationString("notification_update_message")) || `{appName} has been updated to version {version}. Click to see what's new.`;
      
      message = message.replace("{appName}", appName).replace("{version}", version);

      // Create and display the notification with a specific ID.
      // The click event will be handled by a separate listener.
      await Browser.notifications.create("update-notification", {
        type: "basic",
        iconUrl: Browser.runtime.getURL("icons/extension_icon_128.png"),
        title: title,
        message: message,
        // Optional: Make it more obvious it's clickable on some systems
        requireInteraction: true 
      });
      logME("Update notification created.");
      
    } catch (e) {
      logME("[onInstalled] Failed to create update notification:", e);
    }
  }
});