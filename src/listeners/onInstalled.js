// src/listeners/onInstalled.js
import Browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { setupContextMenus } from "./onContextMenu.js";
import { CONFIG, getSettingsAsync } from "../config.js";

/**
 * Merges new configuration keys with existing user settings
 * This ensures that when the extension updates with new config keys,
 * they are properly added to user's storage without overriding their existing settings
 */
async function migrateConfigSettings() {
  try {
    logME("[onInstalled] Starting config migration...");
    
    // Get current user settings from storage
    const currentSettings = await getSettingsAsync();
    
    // Check if any new keys were added
    const newKeys = Object.keys(CONFIG).filter(key => !(key in currentSettings));
    const updatedKeys = [];
    
    // Check for keys that exist but might have different default values
    // (This is optional - you might want to preserve user's existing values)
    Object.keys(CONFIG).forEach(key => {
      if (key in currentSettings && currentSettings[key] !== CONFIG[key]) {
        // User has customized this setting, keep their value
        // But log it for debugging
        logME(`[onInstalled] Preserving user setting: ${key} = ${currentSettings[key]} (default: ${CONFIG[key]})`);
      }
    });
    
    if (newKeys.length > 0) {
      logME(`[onInstalled] Adding ${newKeys.length} new config keys:`, newKeys);
      
      // Only save the new keys to avoid unnecessary storage writes
      const newSettings = {};
      newKeys.forEach(key => {
        newSettings[key] = CONFIG[key];
      });
      
      await Browser.storage.local.set(newSettings);
      logME("[onInstalled] Config migration completed successfully");
    } else {
      logME("[onInstalled] No new config keys found, migration skipped");
    }
    
    return { newKeys, updatedKeys };
  } catch (error) {
    logME("[onInstalled] Config migration failed:", error);
    throw error;
  }
}

Browser.runtime.onInstalled.addListener(async (details) => {
  logME(`[Translate-It!] 🌟 Success: ${details.reason}`);

  // Setup all context menus on installation or update
  await setupContextMenus();

  // Migrate configuration settings for both install and update scenarios
  try {
    await migrateConfigSettings();
  } catch (error) {
    logME("[onInstalled] Config migration failed, but continuing with other setup:", error);
  }

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
