
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.NOTIFICATIONS, 'WarningManager');

/**
 * Checks if a specific provider warning should be shown, limited to a certain number of times.
 * @param {string} providerId - The ID of the provider (e.g., 'BingTranslate', 'Lingva')
 * @param {number} limit - Maximum number of times to show the warning (default: 3)
 * @returns {Promise<boolean>} - True if the warning should be shown
 */
export async function shouldShowProviderWarning(providerId, limit = 3) {
  try {
    const key = `warning_count_${providerId.toLowerCase()}`;
    const result = await storageManager.get({ [key]: 0 });
    const currentCount = result[key];

    if (currentCount < limit) {
      await storageManager.set({ [key]: currentCount + 1 });
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Error checking provider warning count:', error);
    return true; // Default to showing if error occurs
  }
}

/**
 * Checks if a specific warning is permanently hidden.
 * @param {string} warningKey - Unique key for the warning
 * @returns {Promise<boolean>} - True if the warning is hidden
 */
export async function isWarningHidden(warningKey) {
  try {
    const key = `warning_hidden_${warningKey.toLowerCase()}`;
    const result = await storageManager.get({ [key]: false });
    return !!result[key];
  } catch (error) {
    logger.error('Error checking if warning is hidden:', error);
    return false;
  }
}

/**
 * Permanently hides or shows a specific warning.
 * @param {string} warningKey - Unique key for the warning
 * @param {boolean} hidden - Whether to hide the warning (default: true)
 */
export async function setWarningHidden(warningKey, hidden = true) {
  try {
    const key = `warning_hidden_${warningKey.toLowerCase()}`;
    await storageManager.set({ [key]: !!hidden });
    logger.info(`Warning "${warningKey}" visibility set to: ${!hidden}`);
  } catch (error) {
    logger.error('Error setting warning visibility:', error);
  }
}
