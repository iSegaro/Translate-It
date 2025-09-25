/**
 * Installation Handler - Unified handler for runtime.onInstalled events
 * Handles extension installation, updates, and migrations
 */

import browser from "webextension-polyfill";

import { utilsFactory } from "@/utils/UtilsFactory.js";
import { CONFIG } from "@/shared/config/config.js";
import { storageManager } from "@/shared/storage/core/StorageCore.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { runSettingsMigrations } from "@/shared/config/settingsMigrations.js";

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
    const vueDefaults = {};

    Object.assign(migratedData, vueDefaults);

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

    logger.init('Legacy migration completed successfully');

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
    // First, handle legacy migration if needed
    const migrationStatus = await detectLegacyMigration();

    if (migrationStatus.isLegacyMigration) {
      const existingData = await storageManager.get();
      const legacyResult = await performLegacyMigration(existingData);

      // After legacy migration, also run settings migrations
      await runIncrementalSettingsMigrations();

      return { ...legacyResult, settingsMigrated: true };
    }

    // Run incremental settings migrations for Vue-to-Vue updates
    await runIncrementalSettingsMigrations();

    return { success: true, settingsMigrated: true };
  } catch (error) {
    logger.error('Config migration failed:', error);
    throw error;
  }
}

/**
 * Runs incremental settings migrations based on version tracking
 */
async function runIncrementalSettingsMigrations() {
  try {
    // Get current settings from storage
    const currentSettings = await storageManager.get();

    // Always run migration for update events to ensure users get latest settings
    // The migration function itself will check if updates are actually needed
    const { updates, logs } = await runSettingsMigrations(
      { ...currentSettings } // Pass copy of current settings
    );

    logger.debug('Migration result', {
      updatesCount: Object.keys(updates).length,
      updateKeys: Object.keys(updates),
      logs
    });

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await storageManager.set(updates);
      logger.info('Applied settings migration updates', {
        updateCount: Object.keys(updates).length,
        logs
      });
    } else {
      logger.info('No settings updates needed');
    }

  } catch (error) {
    logger.error('Settings migration failed:', error);
    // Don't throw - allow extension to continue working
  }
}

/**
 * Handle fresh installation
 */
async function handleFreshInstallation() {
  const storage = await storageManager.get();
  const hasExistingData = Object.keys(storage).length > 0;

  if (hasExistingData) {
    logger.init('Legacy migration detected during fresh install');

    // Open options page with welcome message for migrated users
    const optionsUrl = browser.runtime.getURL("html/options.html#about");
    await browser.tabs.create({ url: optionsUrl });
  } else {
    // Truly fresh installation - initialize with default settings
    await storageManager.set(CONFIG);
    logger.init('Fresh installation completed with default settings');

    const optionsUrl = browser.runtime.getURL("html/options.html#languages");
    await browser.tabs.create({ url: optionsUrl });
  }
}

/**
 * Handle extension update
 */
async function handleExtensionUpdate() {
  try {
    const manifest = browser.runtime.getManifest();
    const version = manifest.version;

    const { getTranslationString } = await utilsFactory.getI18nUtils();
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

    // Try to get icon URL, fallback to empty string if it fails
    let iconUrl = "";
    try {
      // Use the correct path based on the build structure
      iconUrl = browser.runtime.getURL("icons/extension/extension_icon_128.png");
    } catch (error) {
      // Icon not found, use empty string
      logger.warn('Could not load extension icon:', error);
    }

    // Create a base options object with properties common to all browsers.
    const notificationOptions = {
      type: "basic",
      iconUrl: iconUrl,
      title: title,
      message: message,
    };

    await browser.notifications.clear("update-notification");

    // --- END: BROWSER-AWARE NOTIFICATION OPTIONS ---

    await browser.notifications.create(
      "update-notification",
      notificationOptions,
    );

    logger.init(`Extension updated to version ${version}`);
  } catch (e) {
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
    await browser.contextMenus.removeAll();
  } catch (error) {
    logger.error('Failed to cleanup context menus:', error);
  }
}

/**
 * Main installation event handler
 */
export async function handleInstallationEvent(details) {
  logger.init(`Installation event: ${details.reason}`);

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
      // Browser was updated but extension wasn't
    }

    logger.init('Installation handling completed');
  } catch (error) {
    logger.error('Error during installation handling:', error);
    // Don't throw - allow extension to continue working
  }
}

// Also expose the function for manual triggering
export async function manualTriggerMigration() {
  logger.info('Manual migration triggered');
  await runIncrementalSettingsMigrations();
}

/**
 * Manual trigger for testing update notifications (for development)
 */
export async function triggerTestUpdateNotification() {
  await handleExtensionUpdate();
}

/**
 * Manual trigger for testing installation events (for development)
 */
export async function triggerTestInstallation(reason = "update") {
  await handleInstallationEvent({ reason });
}