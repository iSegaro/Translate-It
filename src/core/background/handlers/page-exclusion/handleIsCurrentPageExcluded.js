import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { getUrlExclusionKey } from '@/utils/ui/exclusion.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleIsCurrentPageExcluded');
/**
 * Handler for checking if current page is excluded from extension
 */

/**
 * Check if a URL should be excluded
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the page is excluded
 */
async function isPageExcluded(url) {
  try {
    const urlObj = new URL(url)
    const exclusionKey = getUrlExclusionKey(url)
    
    // Check if extension is enabled globally first
    const mainSettings = await storageManager.get({ EXTENSION_ENABLED: true });
    if (!mainSettings.EXTENSION_ENABLED) {
      return true; // Exclude ALL pages if extension is OFF
    }
    
    // Always exclude extension pages
    if (urlObj.protocol === 'chrome-extension:' || urlObj.protocol === 'moz-extension:') {
      return true
    }
    
    // Always exclude browser internal pages
    if (urlObj.protocol === 'chrome:' || urlObj.protocol === 'about:') {
      return true
    }
    
    // Check user's exclusion settings
    const storage = await storageManager.get(['EXCLUDED_SITES'])
    let excludedSites = []
    
    // Handle both array and string formats
    if (Array.isArray(storage.EXCLUDED_SITES)) {
      excludedSites = storage.EXCLUDED_SITES.filter(Boolean)
    } else if (typeof storage.EXCLUDED_SITES === 'string') {
      excludedSites = storage.EXCLUDED_SITES
        .split(',')
        .map(site => site.trim())
        .filter(Boolean)
    }
    
    if (!exclusionKey) {
      return true
    }
    
    // Check if current page is in excluded sites list.
    // Web URLs use hostname matching, while local files use exact file-path matching.
    const isExcluded = excludedSites.some(site => 
      exclusionKey === site ||
      (urlObj.protocol !== 'file:' && (
        exclusionKey.endsWith('.' + site) ||
        site.includes(exclusionKey)
      ))
    )
    
    return isExcluded
  } catch {
    // If URL parsing fails, exclude for safety
    return true
  }
}

/**
 * Handles the 'isCurrentPageExcluded' message action.
 * @param {Object} message - The message object.
 * @returns {Promise<Object>} - Response object for CoreMessageRouter.
 */
export async function handleIsCurrentPageExcluded(message) {
  try {
    const { url } = message.data || {}
    
    if (!url) {
      return { success: false, error: 'URL is required' }
    }

    const excluded = await isPageExcluded(url)
    
    return { success: true, excluded }
  } catch (error) {
    logger.error('[handleIsCurrentPageExcluded] Error:', error)
    return { success: false, error: 'Failed to check page exclusion status' }
  }
}
