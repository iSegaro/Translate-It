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

    // For now, just log the action - this can be enhanced later
    // to actually store exclusion settings
    console.log(`[handleSetExcludeCurrentPage] Setting exclusion for ${url}: ${exclude}`)
    
    // TODO: Implement actual storage of exclusion settings
    // await saveExclusionSetting(url, exclude)
    
    sendResponse({ 
      success: true, 
      url, 
      excluded: exclude 
    })
    return false
  } catch (error) {
    console.error('[handleSetExcludeCurrentPage] Error:', error)
    sendResponse({ success: false, error: 'Failed to set page exclusion status' })
    return false
  }
}