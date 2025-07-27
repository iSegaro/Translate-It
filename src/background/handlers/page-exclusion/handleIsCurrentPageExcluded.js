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
  } catch (error) {
    // If URL parsing fails, exclude for safety
    return true
  }
}

/**
 * Handles the 'isCurrentPageExcluded' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - False for synchronous response.
 */
export function handleIsCurrentPageExcluded(message, sender, sendResponse) {
  try {
    const { url } = message.data || {}
    
    if (!url) {
      sendResponse({ success: false, error: 'URL is required' })
      return false
    }

    const excluded = isPageExcluded(url)
    
    sendResponse({ success: true, excluded })
    return false
  } catch (error) {
    console.error('[handleIsCurrentPageExcluded] Error:', error)
    sendResponse({ success: false, error: 'Failed to check page exclusion status' })
    return false
  }
}