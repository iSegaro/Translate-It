/**
 * Installation Handler - Unified handler for runtime.onInstalled events
 * Handles extension installation, updates, and migrations
 */

import browser from "webextension-polyfill";
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { CONFIG, getSettingsAsync } from "../config.js";

/**
 * Detects if this is a migration from old version to Vue version
 */
async function detectLegacyMigration() {
  try {
    const storage = await browser.storage.local.get();

    const hasVueMarkers =
      "VUE_MIGRATED" in storage || "EXTENSION_VERSION" in storage;
    const hasLegacyData =
      (("API_KEY" in storage || "TRANSLATION_API" in storage) &&
        !hasVueMarkers) ||
      "translationHistory" in storage ||
      "lastTranslation" in storage;

    return {
      isLegacyMigration: hasLegacyData && !hasVueMarkers,
      hasExistingData: Object.keys(storage).length > 0,
      storageKeys: Object.keys(storage),
    };
  } catch (error) {
    logME("[Migration] Error detecting legacy migration:", error);
    return {
      isLegacyMigration: false,
      hasExistingData: false,
      storageKeys: [],
    };
  }
}

/**
 * Performs data migration from legacy version to Vue architecture
 */
async function performLegacyMigration(existingData) {
  try {
    logME("[Migration] Starting legacy data migration...");

    const migratedData = { ...existingData };
    const migrationLog = [];

    // 1. Migrate complex objects
    if (
      existingData.GEMINI_MODELS &&
      Array.isArray(existingData.GEMINI_MODELS)
    ) {
      migrationLog.push("Preserved GEMINI_MODELS array structure");
    }

    if (
      existingData.translationHistory &&
      Array.isArray(existingData.translationHistory)
    ) {
      migrationLog.push(
        `Preserved ${existingData.translationHistory.length} translation history entries`,
      );
    }

    // 2. Handle encrypted data migration
    if (existingData._hasEncryptedKeys && existingData._secureKeys) {
      migrationLog.push("Preserved encrypted API keys structure");
    }

    // 3. Add Vue-specific settings
    const vueDefaults = {
      VUE_MIGRATED: true,
      MIGRATION_DATE: new Date().toISOString(),
      MIGRATION_FROM_VERSION: "legacy",
      EXTENSION_VERSION: browser.runtime.getManifest().version,
    };

    Object.assign(migratedData, vueDefaults);
    migrationLog.push("Added Vue migration markers");

    // 4. Ensure all CONFIG defaults are present
    Object.keys(CONFIG).forEach((key) => {
      if (!(key in migratedData)) {
        migratedData[key] = CONFIG[key];
        migrationLog.push(`Added missing config key: ${key}`);
      }
    });

    // 5. Save migrated data
    await browser.storage.local.clear();
    await browser.storage.local.set(migratedData);

    logME("[Migration] Legacy migration completed successfully:");
    migrationLog.forEach((entry) => logME(`  - ${entry}`));

    return {
      success: true,
      migratedKeys: Object.keys(migratedData),
      migrationLog,
    };
  } catch (error) {
    logME("[Migration] Legacy migration failed:", error);
    throw error;
  }
}

/**
 * Migrates configuration settings for updates
 */
async function migrateConfigSettings() {
  try {
    logME("[InstallationHandler] Starting config migration...");

    const migrationStatus = await detectLegacyMigration();

    if (migrationStatus.isLegacyMigration) {
      logME(
        "[InstallationHandler] Legacy migration detected - performing full migration",
      );
      const existingData = await browser.storage.local.get();
      return await performLegacyMigration(existingData);
    }

    // Regular config migration for Vue-to-Vue updates
    const currentSettings = await getSettingsAsync();
    const newKeys = Object.keys(CONFIG).filter(
      (key) => !(key in currentSettings),
    );

    // Check for customized settings
    Object.keys(CONFIG).forEach((key) => {
      if (key in currentSettings && currentSettings[key] !== CONFIG[key]) {
        logME(
          `[InstallationHandler] Preserving user setting: ${key} = ${currentSettings[key]} (default: ${CONFIG[key]})`,
        );
      }
    });

    if (newKeys.length > 0) {
      logME(
        `[InstallationHandler] Adding ${newKeys.length} new config keys:`,
        newKeys,
      );

      const newSettings = {};
      newKeys.forEach((key) => {
        newSettings[key] = CONFIG[key];
      });

      await browser.storage.local.set(newSettings);
      logME("[InstallationHandler] Config migration completed successfully");
    } else {
      logME(
        "[InstallationHandler] No new config keys found, migration skipped",
      );
    }

    return { newKeys, success: true };
  } catch (error) {
    logME("[InstallationHandler] Config migration failed:", error);
    throw error;
  }
}

/**
 * Handle fresh installation
 */
async function handleFreshInstallation() {
  logME("[InstallationHandler] First installation detected.");

  const storage = await browser.storage.local.get();
  const hasExistingData = Object.keys(storage).length > 0;

  if (hasExistingData) {
    logME(
      "[InstallationHandler] Existing data found during fresh install - likely legacy migration",
    );

    // Open options page with welcome message for migrated users
    const optionsUrl = browser.runtime.getURL("options.html#about");
    await browser.tabs.create({ url: optionsUrl });

    // Show migration success notification
    try {
      await browser.notifications.create("migration-success", {
        type: "basic",
        iconUrl: browser.runtime.getURL("icons/extension_icon_128.png"),
        title: "Migration Successful",
        message:
          "Your settings have been migrated to the new Vue version. Click to review your settings.",
      });
    } catch (error) {
      logME(
        "[InstallationHandler] Failed to show migration notification:",
        error,
      );
    }
  } else {
    // Truly fresh installation
    logME("[InstallationHandler] Fresh installation with no existing data");
    const optionsUrl = browser.runtime.getURL("options.html#languages");
    await browser.tabs.create({ url: optionsUrl });
  }
}

/**
 * Handle extension update
 */
async function handleExtensionUpdate() {
  try {
    console.log(
      "[InstallationHandler] Starting update notification creation...",
    );

    const manifest = browser.runtime.getManifest();
    const version = manifest.version;
    console.log("[InstallationHandler] Extension version:", version);

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

    console.log("[InstallationHandler] Notification details:", {
      appName,
      title,
      message,
    });

    // --- START: BROWSER-AWARE NOTIFICATION OPTIONS ---

    // Create a base options object with properties common to all browsers.
    const notificationOptions = {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/extension_icon_128.png"),
      title: title,
      message: message,
    };

    console.log(
      "[InstallationHandler] Notification options:",
      notificationOptions,
    );

    // --- Clear any existing notification with the same ID before creating a new one ---
    await browser.notifications.clear("update-notification");
    console.log("[InstallationHandler] Cleared existing notifications");

    // --- END: BROWSER-AWARE NOTIFICATION OPTIONS ---

    // Create the notification using the compatible options object.
    const notificationId = await browser.notifications.create(
      "update-notification",
      notificationOptions,
    );

    console.log(
      "[InstallationHandler] Notification created with ID:",
      notificationId,
    );
    logME(
      "[InstallationHandler] Update notification created with browser-specific options.",
    );
  } catch (e) {
    // This will now only catch unexpected errors, not the compatibility error.
    console.error(
      "[InstallationHandler] Failed to create update notification:",
      e,
    );
    logME("[InstallationHandler] Failed to create update notification:", e);
  }
}

/**
 * Setup context menus on installation
 */
async function setupContextMenus() {
  try {
    console.log("[InstallationHandler] Setting up context menus...");

    // Clear all previous context menus to prevent duplicate errors
    await browser.contextMenus.removeAll();
    console.log("[InstallationHandler] All previous context menus removed.");
    logME("[InstallationHandler] All previous context menus removed.");

    // Basic context menu setup - will be expanded when full context menu system is implemented
    const pageMenuTitle =
      (await getTranslationString("context_menu_translate_with_selection")) ||
      "Translate Element";
    console.log(
      "[InstallationHandler] Creating context menu with title:",
      pageMenuTitle,
    );

    const menuItem = browser.contextMenus.create({
      id: "translate-with-select-element",
      title: pageMenuTitle,
      contexts: ["page", "selection"],
    });

    console.log("[InstallationHandler] Context menu created:", menuItem);
    logME("[InstallationHandler] Basic context menus setup completed");
  } catch (error) {
    console.error(
      "[InstallationHandler] Failed to setup context menus:",
      error,
    );
    logME("[InstallationHandler] Failed to setup context menus:", error);
  }
}

/**
 * Main installation event handler
 */
export async function handleInstallationEvent(details) {
  console.log(
    `[InstallationHandler] 🌟 Installation event triggered: ${details.reason}`,
  );
  logME(`[InstallationHandler] 🌟 Success: ${details.reason}`);

  try {
    // Setup context menus for all scenarios
    await setupContextMenus();

    // Migrate configuration settings
    await migrateConfigSettings();

    // Handle specific installation scenarios
    if (details.reason === "install") {
      await handleFreshInstallation();
    } else if (details.reason === "update") {
      await handleExtensionUpdate();
    } else if (
      details.reason === "chrome_update" ||
      details.reason === "browser_update"
    ) {
      // Browser was updated but extension wasn't - just log
      logME("[InstallationHandler] Browser updated, extension still running");
    }

    logME("[InstallationHandler] Installation handling completed successfully");
  } catch (error) {
    logME("[InstallationHandler] Error during installation handling:", error);
    // Don't throw - allow extension to continue working
  }
}

/**
 * Manual trigger for testing update notifications (for development)
 */
export async function triggerTestUpdateNotification() {
  logME("[InstallationHandler] Manual update notification trigger");
  await handleExtensionUpdate();
}

/**
 * Manual trigger for testing installation events (for development)
 */
export async function triggerTestInstallation(reason = "update") {
  logME(`[InstallationHandler] Manual installation trigger: ${reason}`);
  await handleInstallationEvent({ reason });
}
