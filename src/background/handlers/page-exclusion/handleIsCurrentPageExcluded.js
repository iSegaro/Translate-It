/**
 * Handler for checking if current page is excluded from extension
 */

/**
 * Check if a URL should be excluded
 * @param {string} url - The URL to check
 * @returns {boolean} - Whether the page is excluded
 */
function isPageExcluded(url) {
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
    
    // For now, return false for all other pages
    // This can be enhanced to check user's exclusion settings
    return false
  } catch (_error) {
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

    const excluded = isPageExcluded(url)
    
    return { success: true, excluded }
  } catch (error) {
    console.error('[handleIsCurrentPageExcluded] Error:', error)
    return { success: false, error: 'Failed to check page exclusion status' }
  }
}