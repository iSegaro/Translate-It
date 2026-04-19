/**
 * Exclusion Utils - Light-weight utility functions for page exclusion
 * This file MUST NOT have any imports to avoid side effects in early loading phases.
 */

/**
 * Perform a fast, non-blocking check with the background script to see if the current page is excluded.
 * This is used for "Fast Fail" early in the content script lifecycle.
 * 
 * @param {string} url - The URL to check
 * @returns {Promise<boolean>} - Whether the page is excluded
 */
export async function checkUrlExclusionAsync(url) {
  try {
    // Determine browser API (Chrome/Firefox compatible)
    const browserAPI = typeof browser !== "undefined" ? browser : (typeof chrome !== "undefined" ? chrome : null);
    if (!browserAPI?.runtime?.sendMessage) return false;

    // Use raw sendMessage to avoid loading the entire messaging system early
    const response = await browserAPI.runtime.sendMessage({
      action: 'isCurrentPageExcluded',
      data: { url: url || window.location.href }
    });
    
    return !!(response && response.success && response.excluded);
  } catch {
    // Fail safe: if messaging fails, assume not excluded and let regular logic handle it later
    return false;
  }
}
