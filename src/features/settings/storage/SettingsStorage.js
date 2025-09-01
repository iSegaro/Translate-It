/**
 * SettingsStorage - Specialized storage module for application settings
 * Handles configuration, user preferences, and application state
 */

import { storageCore } from '../core/StorageCore.js';
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.STORAGE, 'SettingsStorage');

export class SettingsStorage {
  constructor() {
    this.storage = storageCore;
    this.prefix = 'settings_';
  }

  /**
   * Get application settings with defaults
   * @param {Object} defaults - Default values
   * @returns {Promise<Object>} Settings object
   */
  async getSettings(defaults = {}) {
    try {
      const keys = Object.keys(defaults).map(key => `${this.prefix}${key}`);
      const result = await this.storage.get(keys);
      
      // Remove prefix and apply defaults
      const settings = {};
      for (const [key, value] of Object.entries(defaults)) {
        const storageKey = `${this.prefix}${key}`;
        settings[key] = result[storageKey] !== undefined ? result[storageKey] : value;
      }
      
      return settings;
    } catch (error) {
      logger.error('[SettingsStorage] Get settings failed:', error);
      return defaults;
    }
  }

  /**
   * Save application settings
   * @param {Object} settings - Settings to save
   * @returns {Promise<void>}
   */
  async saveSettings(settings) {
    try {
      const data = {};
      for (const [key, value] of Object.entries(settings)) {
        data[`${this.prefix}${key}`] = value;
      }
      
      await this.storage.set(data);
      logger.debug(`[SettingsStorage] Saved ${Object.keys(settings).length} setting(s)`);
    } catch (error) {
      logger.error('[SettingsStorage] Save settings failed:', error);
      throw error;
    }
  }

  /**
   * Get a single setting value
   * @param {string} key - Setting key
   * @param {*} defaultValue - Default value
   * @returns {Promise<*>} Setting value
   */
  async getSetting(key, defaultValue = null) {
    try {
      const result = await this.storage.get({ [`${this.prefix}${key}`]: defaultValue });
      return result[`${this.prefix}${key}`];
    } catch (error) {
      logger.error(`[SettingsStorage] Get setting '${key}' failed:`, error);
      return defaultValue;
    }
  }

  /**
   * Save a single setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @returns {Promise<void>}
   */
  async saveSetting(key, value) {
    try {
      await this.storage.set({ [`${this.prefix}${key}`]: value });
      logger.debug(`[SettingsStorage] Saved setting '${key}'`);
    } catch (error) {
      logger.error(`[SettingsStorage] Save setting '${key}' failed:`, error);
      throw error;
    }
  }

  /**
   * Remove settings
   * @param {string|string[]} keys - Keys to remove
   * @returns {Promise<void>}
   */
  async removeSettings(keys) {
    try {
      const keyList = Array.isArray(keys) ? keys : [keys];
      const storageKeys = keyList.map(key => `${this.prefix}${key}`);
      
      await this.storage.remove(storageKeys);
      logger.debug(`[SettingsStorage] Removed ${keyList.length} setting(s)`);
    } catch (error) {
      logger.error('[SettingsStorage] Remove settings failed:', error);
      throw error;
    }
  }

  /**
   * Clear all settings
   * @returns {Promise<void>}
   */
  async clearSettings() {
    try {
      // Get all keys with our prefix
      const allData = await this.storage.get();
      const settingsKeys = Object.keys(allData).filter(key => key.startsWith(this.prefix));
      
      if (settingsKeys.length > 0) {
        await this.storage.remove(settingsKeys);
        logger.debug(`[SettingsStorage] Cleared ${settingsKeys.length} setting(s)`);
      }
    } catch (error) {
      logger.error('[SettingsStorage] Clear settings failed:', error);
      throw error;
    }
  }

  /**
   * Listen for setting changes
   * @param {string} key - Setting key to watch
   * @param {Function} callback - Callback function
   */
  onSettingChange(key, callback) {
    const storageKey = `${this.prefix}${key}`;
    this.storage.on(`change:${storageKey}`, ({ newValue, oldValue }) => {
      callback(newValue, oldValue, key);
    });
  }

  /**
   * Remove setting change listener
   * @param {string} key - Setting key
   * @param {Function} callback - Callback function
   */
  offSettingChange(key, callback) {
    const storageKey = `${this.prefix}${key}`;
    this.storage.off(`change:${storageKey}`, callback);
  }
}

// Create singleton instance
const settingsStorage = new SettingsStorage();

export { settingsStorage };
export default settingsStorage;