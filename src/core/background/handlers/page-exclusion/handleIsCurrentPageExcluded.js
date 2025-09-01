import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

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
    
    const domain = urlObj.hostname
    
    // Check if current domain is in excluded sites list
    const isExcluded = excludedSites.some(site => 
      domain === site || domain.endsWith('.' + site) || site.includes(domain)
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