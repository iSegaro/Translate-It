/**
 * Installation Handler - Unified handler for runtime.onInstalled events
 * Handles extension installation, updates, and migrations
 */

import browser from "webextension-polyfill";

import { getTranslationString } from "@/utils/i18n/i18n.js";
import { CONFIG, getSettingsAsync } from "@/shared/config/config.js";
import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'InstallHandler');

/**
 * Detects if this is a migration from old version to Vue version
 */
async function detectLegacyMigration() {
  try {
    const storage = await storageManager.get();

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
    logger.error('Error detecting legacy migration:', error);
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
    logger.debug('Starting legacy data migration...');

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
    await storageManager.clear();
    await storageManager.set(migratedData);

    logger.init('Legacy migration completed successfully:');
    migrationLog.forEach(() => logger.debug('- '));

    return {
      success: true,
      migratedKeys: Object.keys(migratedData),
      migrationLog,
    };
  } catch (error) {
    logger.error('Legacy migration failed:', error);
    throw error;
  }
}

/**
 * Migrates configuration settings for updates
 */
async function migrateConfigSettings() {
  try {
    logger.debug('Starting config migration...');

    const migrationStatus = await detectLegacyMigration();

    if (migrationStatus.isLegacyMigration) {
      logger.debug('Legacy migration detected - performing full migration',  );
      const existingData = await storageManager.get();
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
        logger.debug('Preserving user setting: ${key} = ${currentSettings[key]} (default: ${CONFIG[key]})',  );
      }
    });

    if (newKeys.length > 0) {
      logger.debug('Adding ${newKeys.length} new config keys:', newKeys,
      );

      const newSettings = {};
      newKeys.forEach((key) => {
        newSettings[key] = CONFIG[key];
      });

      await storageManager.set(newSettings);
      logger.init('Config migration completed successfully');
    } else {
      logger.debug('No new config keys found, migration skipped',  );
    }

    return { newKeys, success: true };
  } catch (error) {
    logger.error('Config migration failed:', error);
    throw error;
  }
}

/**
 * Handle fresh installation
 */
async function handleFreshInstallation() {
  logger.debug('First installation detected.');

  const storage = await storageManager.get();
  const hasExistingData = Object.keys(storage).length > 0;

  if (hasExistingData) {
    logger.debug('Existing data found during fresh install - likely legacy migration',  );

    // Open options page with welcome message for migrated users
    const optionsUrl = browser.runtime.getURL("html/options.html#about");
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
      logger.error('Failed to show migration notification:', error,
      );
    }
  } else {
    // Truly fresh installation - initialize with default settings
    logger.debug('Fresh installation with no existing data - initializing defaults');

    // Save all CONFIG defaults to storage
    await storageManager.set(CONFIG);
    logger.debug('Default configuration settings saved for fresh installation');

    const optionsUrl = browser.runtime.getURL("html/options.html#languages");
    await browser.tabs.create({ url: optionsUrl });
  }
}

/**
 * Handle extension update
 */
async function handleExtensionUpdate() {
  try {
    logger.debug(
      "[InstallationHandler] Starting update notification creation...",
    );

    const manifest = browser.runtime.getManifest();
    const version = manifest.version;
    logger.debug("[InstallationHandler] Extension version:", version);

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

    logger.debug("[InstallationHandler] Notification details:", {
      appName,
      title,
      message,
    });

    // --- START: BROWSER-AWARE NOTIFICATION OPTIONS ---

    // Try to get icon URL, fallback to empty string if it fails
    let iconUrl = "";
    try {
      // Use the correct path based on the build structure
      iconUrl = browser.runtime.getURL("icons/extension/extension_icon_128.png");
    } catch (iconError) {
      logger.debug("[InstallationHandler] Could not get icon URL:", iconError);
      // Try fallback path
      try {
        iconUrl = browser.runtime.getURL("assets/icons/extension/extension_icon_128.png");
      } catch (e) {
        logger.debug("[InstallationHandler] Fallback icon URL also failed");
      }
    }

    // Create a base options object with properties common to all browsers.
    const notificationOptions = {
      type: "basic",
      iconUrl: iconUrl,
      title: title,
      message: message,
    };

    logger.debug(
      "[InstallationHandler] Notification options:",
      notificationOptions,
    );

    // --- Clear any existing notification with the same ID before creating a new one ---
    await browser.notifications.clear("update-notification");
    logger.debug("[InstallationHandler] Cleared existing notifications");

    // --- END: BROWSER-AWARE NOTIFICATION OPTIONS ---

    // Create the notification using the compatible options object.
    const notificationId = await browser.notifications.create(
      "update-notification",
      notificationOptions,
    );

    logger.debug(
      "[InstallationHandler] Notification created with ID:",
      notificationId,
    );
    logger.debug('Update notification created with browser-specific options.',  );
  } catch (e) {
    // This will now only catch unexpected errors, not the compatibility error.
    logger.error(
      "[InstallationHandler] Failed to create update notification:",
      e,
    );
    logger.error('Failed to create update notification:', e);
  }
}

/**
 * Setup context menus on installation
 * Note: Context menu creation is now handled by ContextMenuManager
 * This function only clears existing menus to prevent duplicates
 */
async function setupContextMenus() {
  try {
    logger.debug("[InstallationHandler] Clearing previous context menus...");

    // Clear all previous context menus to prevent duplicate errors
    await browser.contextMenus.removeAll();
    logger.debug("[InstallationHandler] All previous context menus removed.");
    logger.debug('All previous context menus removed.');

    // Note: Context menu creation is now handled by ContextMenuManager in LifecycleManager
    logger.info('Context menu cleanup completed - ContextMenuManager will handle creation');
  } catch (error) {
    logger.error('Failed to cleanup context menus:', error);
  }
}

/**
 * Main installation event handler
 */
export async function handleInstallationEvent(details) {
  logger.debug(
    `[InstallationHandler] 🌟 Installation event triggered: ${details.reason}`,
  );
  logger.init('🌟 Success: ${details.reason}');

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
      logger.debug('Browser updated, extension still running');
    }

    logger.init('Installation handling completed successfully');
  } catch (error) {
    logger.error('Error during installation handling:', error);
    // Don't throw - allow extension to continue working
  }
}

/**
 * Manual trigger for testing update notifications (for development)
 */
export async function triggerTestUpdateNotification() {
  logger.debug('Manual update notification trigger');
  await handleExtensionUpdate();
}

/**
 * Manual trigger for testing installation events (for development)
 */
export async function triggerTestInstallation(reason = "update") {
  logger.debug('Manual installation trigger: ${reason}');
  await handleInstallationEvent({ reason });
}