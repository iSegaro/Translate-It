import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'handleSetExcludeCurrentPage');
/**
 * Handler for setting page exclusion status
 */

/**
 * Handles the 'setExcludeCurrentPage' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - False for synchronous response.
 */
export function handleSetExcludeCurrentPage(message, sender, sendResponse) {
  try {
    const { exclude, url } = message.data || {}
    
    if (typeof exclude !== 'boolean' || !url) {
      sendResponse({ success: false, error: 'Exclude status (boolean) and URL are required' })
      return false
    }

    // Handle the exclusion setting asynchronously
    const handleExclusion = async () => {
      try {
        const urlObj = new URL(url)
        const domain = urlObj.hostname
        
        logger.debug(`[handleSetExcludeCurrentPage] Setting exclusion for ${domain}: ${exclude}`)
        
        // Get current excluded sites
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
        
        if (exclude) {
          // Add domain to excluded sites if not already present
          if (!excludedSites.includes(domain)) {
            excludedSites.push(domain)
            await storageManager.set({
              EXCLUDED_SITES: excludedSites
            })
            logger.info(`[handleSetExcludeCurrentPage] Added ${domain} to excluded sites`)
          }
        } else {
          // Remove domain from excluded sites
          const updatedSites = excludedSites.filter(site => site !== domain)
          if (updatedSites.length !== excludedSites.length) {
            await storageManager.set({
              EXCLUDED_SITES: updatedSites
            })
            logger.info(`[handleSetExcludeCurrentPage] Removed ${domain} from excluded sites`)
          }
        }
        
        sendResponse({ 
          success: true, 
          url, 
          domain,
          excluded: exclude 
        })
      } catch (error) {
        logger.error('[handleSetExcludeCurrentPage] Error in async handler:', error)
        sendResponse({ success: false, error: 'Failed to update exclusion settings' })
      }
    }
    
    // Execute async handler
    handleExclusion()
    
    return true // Keep message channel open for async response
  } catch (error) {
    logger.error('[handleSetExcludeCurrentPage] Error:', error)
    sendResponse({ success: false, error: 'Failed to set page exclusion status' })
    return false
  }
}