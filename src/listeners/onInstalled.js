// src/listeners/onInstalled.js
// Cross-browser installation listener with base listener architecture

import { BaseListener } from './base-listener.js';
import { getBrowserAPI } from '../utils/browser-unified.js';
import { logME } from "../utils/helpers.js";
import { getTranslationString } from "../utils/i18n.js";
import { setupContextMenus } from "./onContextMenu.js";
import { CONFIG, getSettingsAsync } from "../config.js";

/**
 * Detects if this is a migration from old version to Vue version
 * Checks for presence of old extension data and Vue-specific markers
 */
async function detectLegacyMigration(Browser) {
  try {
    const storage = await Browser.storage.local.get();
    
    // Check for Vue-specific markers
    const hasVueMarkers = 'VUE_MIGRATED' in storage || 'EXTENSION_VERSION' in storage;
    
    // Check for old extension data patterns
    const hasLegacyData = (
      // Has old config patterns but no Vue markers
      ('API_KEY' in storage || 'TRANSLATION_API' in storage) && !hasVueMarkers
    ) || (
      // Has old file structure patterns
      'translationHistory' in storage || 'lastTranslation' in storage
    );
    
    return {
      isLegacyMigration: hasLegacyData && !hasVueMarkers,
      hasExistingData: Object.keys(storage).length > 0,
      storageKeys: Object.keys(storage)
    };
  } catch (error) {
    logME("[Migration] Error detecting legacy migration:", error);
    return { isLegacyMigration: false, hasExistingData: false, storageKeys: [] };
  }
}

/**
 * Performs data migration from legacy version to Vue architecture
 * Handles complex data structure changes and new settings
 */
async function performLegacyMigration(Browser, existingData) {
  try {
    logME("[Migration] Starting legacy data migration...");
    
    const migratedData = { ...existingData };
    const migrationLog = [];
    
    // 1. Migrate complex objects (arrays, nested objects)
    if (existingData.GEMINI_MODELS && Array.isArray(existingData.GEMINI_MODELS)) {
      // Preserve existing GEMINI_MODELS structure
      migrationLog.push('Preserved GEMINI_MODELS array structure');
    }
    
    if (existingData.translationHistory && Array.isArray(existingData.translationHistory)) {
      // Keep translation history but ensure it's properly formatted
      migrationLog.push(`Preserved ${existingData.translationHistory.length} translation history entries`);
    }
    
    // 2. Handle encrypted data migration
    if (existingData._hasEncryptedKeys && existingData._secureKeys) {
      // Preserve encrypted keys as-is - they'll be handled by secureStorage
      migrationLog.push('Preserved encrypted API keys structure');
    }
    
    // 3. Add Vue-specific settings with defaults
    const vueDefaults = {
      VUE_MIGRATED: true,
      MIGRATION_DATE: new Date().toISOString(),
      MIGRATION_FROM_VERSION: 'legacy',
      EXTENSION_VERSION: Browser.runtime.getManifest().version
    };
    
    Object.assign(migratedData, vueDefaults);
    migrationLog.push('Added Vue migration markers');
    
    // 4. Ensure all CONFIG defaults are present for missing keys
    Object.keys(CONFIG).forEach(key => {
      if (!(key in migratedData)) {
        migratedData[key] = CONFIG[key];
        migrationLog.push(`Added missing config key: ${key}`);
      }
    });
    
    // 5. Save migrated data
    await Browser.storage.local.clear(); // Clean slate
    await Browser.storage.local.set(migratedData);
    
    logME("[Migration] Legacy migration completed successfully:");
    migrationLog.forEach(entry => logME(`  - ${entry}`));
    
    return {
      success: true,
      migratedKeys: Object.keys(migratedData),
      migrationLog
    };
    
  } catch (error) {
    logME("[Migration] Legacy migration failed:", error);
    throw error;
  }
}

/**
 * Merges new configuration keys with existing user settings
 * This ensures that when the extension updates with new config keys,
 * they are properly added to user's storage without overriding their existing settings
 */
async function migrateConfigSettings(Browser) {
  try {
    logME("[onInstalled] Starting config migration...");
    
    // First, detect if this is a legacy migration
    const migrationStatus = await detectLegacyMigration(Browser);
    
    if (migrationStatus.isLegacyMigration) {
      logME("[onInstalled] Legacy migration detected - performing full migration");
      const existingData = await Browser.storage.local.get();
      return await performLegacyMigration(Browser, existingData);
    }
    
    // Regular config migration for Vue-to-Vue updates
    const currentSettings = await getSettingsAsync();
    
    // Check if any new keys were added
    const newKeys = Object.keys(CONFIG).filter(key => !(key in currentSettings));
    
    // Check for keys that exist but might have different default values
    Object.keys(CONFIG).forEach(key => {
      if (key in currentSettings && currentSettings[key] !== CONFIG[key]) {
        // User has customized this setting, keep their value
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
    
    return { newKeys, success: true };
  } catch (error) {
    logME("[onInstalled] Config migration failed:", error);
    throw error;
  }
}

/**
 * Installation Listener Class
 * Handles extension installation and update events
 */
class InstallationListener extends BaseListener {
  constructor() {
    super('runtime', 'onInstalled', 'Installation Listener');
    this.browser = null;
  }

  async initialize() {
    await super.initialize();
    this.browser = await getBrowserAPI();
    
    // Add main installation handler
    this.addHandler(this.handleInstallation.bind(this), 'main-installation-handler');
  }

  /**
   * Handle installation events
   */
  async handleInstallation(details) {
    logME(`[Translate-It!] 🌟 Success: ${details.reason}`);

    // Setup all context menus on installation or update
    await setupContextMenus(this.browser);

    // Migrate configuration settings for both install and update scenarios
    try {
      await migrateConfigSettings(this.browser);
    } catch (error) {
      logME("[onInstalled] Config migration failed, but continuing with other setup:", error);
    }

    // --- Scenario 1: Fresh Installation ---
    if (details.reason === "install") {
      await this.handleFreshInstallation();
    }
    // --- Scenario 2: Extension Update ---
    else if (details.reason === "update") {
      await this.handleExtensionUpdate();
    }
  }

  /**
   * Handle fresh installation
   */
  async handleFreshInstallation() {
    logME("[onInstalled] First installation detected.");
    
    // Check if there's existing data (could be legacy migration)
    const storage = await this.browser.storage.local.get();
    const hasExistingData = Object.keys(storage).length > 0;
    
    if (hasExistingData) {
      logME("[onInstalled] Existing data found during fresh install - likely legacy migration");
      
      // Open options page with welcome message for migrated users
      const optionsUrl = this.browser.runtime.getURL("options.html#about");
      await this.browser.tabs.create({ url: optionsUrl });
      
      // Show migration success notification
      try {
        await this.browser.notifications.create("migration-success", {
          type: "basic",
          iconUrl: this.browser.runtime.getURL("icons/extension_icon_128.png"),
          title: "Migration Successful",
          message: "Your settings have been migrated to the new Vue version. Click to review your settings."
        });
      } catch (error) {
        logME("[onInstalled] Failed to show migration notification:", error);
      }
    } else {
      // Truly fresh installation
      logME("[onInstalled] Fresh installation with no existing data");
      const optionsUrl = this.browser.runtime.getURL("options.html#languages");
      await this.browser.tabs.create({ url: optionsUrl });
    }
  }

  /**
   * Handle extension update
   */
  async handleExtensionUpdate() {
    try {
      const manifest = this.browser.runtime.getManifest();
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

      // Create a base options object with properties common to all browsers
      const notificationOptions = {
        type: "basic",
        iconUrl: this.browser.runtime.getURL("icons/extension_icon_128.png"),
        title: title,
        message: message,
      };

      // Clear any existing notification with the same ID before creating a new one
      await this.browser.notifications.clear("update-notification");
      
      // Create the notification using the compatible options object
      await this.browser.notifications.create(
        "update-notification",
        notificationOptions
      );
      
      logME("[onInstalled] Update notification created with browser-specific options.");
    } catch (e) {
      logME("[onInstalled] Failed to create update notification:", e);
    }
  }
}

// Create and initialize the installation listener
const installationListener = new InstallationListener();

// Initialize and register the listener
installationListener.initialize().then(() => {
  installationListener.register();
  console.log('✅ Installation listener initialized and registered');
}).catch(error => {
  console.error('❌ Failed to initialize installation listener:', error);
});

// Export listener for cleanup if needed
export { installationListener };
