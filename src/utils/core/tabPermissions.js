// src/utils/core/tabPermissions.js
// Tab permissions and accessibility utilities

import { createLogger } from './logger.js';

const logger = createLogger('Core', 'TabPermissions');

/**
 * Check if a URL is restricted for content script injection
 * @param {string} url - The URL to check
 * @returns {boolean} True if URL is restricted
 */
export function isRestrictedUrl(url) {
  if (!url || typeof url !== 'string') return true;
  
  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'moz-extension://',
    'about:',
    'edge://',
    'opera://',
    'vivaldi://',
    'brave://',
    'file://', // Local files may be restricted depending on settings
  ];
  
  return restrictedPrefixes.some(prefix => url.toLowerCase().startsWith(prefix));
}

/**
 * Check if a URL is a special extension page
 * @param {string} url - The URL to check
 * @returns {boolean} True if it's an extension page
 */
export function isExtensionPage(url) {
  if (!url || typeof url !== 'string') return false;
  
  const extensionPrefixes = [
    'chrome-extension://',
    'moz-extension://',
  ];
  
  return extensionPrefixes.some(prefix => url.toLowerCase().startsWith(prefix));
}

/**
 * Check if a URL is a browser internal page
 * @param {string} url - The URL to check
 * @returns {boolean} True if it's a browser internal page
 */
export function isBrowserInternalPage(url) {
  if (!url || typeof url !== 'string') return false;
  
  const internalPrefixes = [
    'chrome://',
    'about:',
    'edge://',
    'opera://',
    'vivaldi://',
    'brave://',
  ];
  
  return internalPrefixes.some(prefix => url.toLowerCase().startsWith(prefix));
}

/**
 * Get a user-friendly error message for restricted URLs
 * @param {string} url - The restricted URL
 * @returns {string} User-friendly error message
 */
export function getRestrictedUrlMessage(url) {
  if (!url) return 'Page information unavailable';
  
  if (isBrowserInternalPage(url)) {
    return 'Feature not available on browser internal pages';
  }
  
  if (isExtensionPage(url)) {
    return 'Feature not available on extension pages';
  }
  
  if (url.toLowerCase().startsWith('file://')) {
    return 'Feature not available on local files (requires additional permissions)';
  }
  
  return 'Feature not available on this type of page';
}

/**
 * Check if content scripts can run on the current page
 * This should be called from content script context
 * @returns {Object} Accessibility information
 */
export function checkContentScriptAccess() {
  try {
    const url = window.location.href;
    const isRestricted = isRestrictedUrl(url);
    
    const result = {
      url,
      isAccessible: !isRestricted,
      isRestricted,
      isExtensionPage: isExtensionPage(url),
      isBrowserInternalPage: isBrowserInternalPage(url),
      errorMessage: isRestricted ? getRestrictedUrlMessage(url) : null,
      timestamp: Date.now()
    };
    
    if (isRestricted) {
      logger.info('[TabPermissions] Content script access restricted:', result);
    }
    
    return result;
  } catch (error) {
    logger.error('[TabPermissions] Error checking content script access:', error);
    return {
      isAccessible: false,
      isRestricted: true,
      errorMessage: 'Unable to determine page accessibility',
      error: error.message,
      timestamp: Date.now()
    };
  }
}

/**
 * Tab permission utilities for background context
 */
export class TabPermissionChecker {
  constructor() {
    this.logger = createLogger('Core', 'TabPermissionChecker');
  }
  
  /**
   * Check if a tab is accessible for content script communication
   * @param {number} tabId - Tab ID to check
   * @returns {Promise<Object>} Accessibility information
   */
  async checkTabAccess(tabId) {
    try {
      if (!tabId || typeof tabId !== 'number') {
        return {
          tabId,
          isAccessible: false,
          isRestricted: true,
          errorMessage: 'Invalid tab ID',
          timestamp: Date.now()
        };
      }
      
      // Get tab information
      let tabInfo;
      try {
        const browser = globalThis.browser || globalThis.chrome;
        tabInfo = await browser.tabs.get(tabId);
      } catch (error) {
        this.logger.warn(`[TabPermissionChecker] Could not get tab info for ${tabId}:`, error);
        return {
          tabId,
          isAccessible: false,
          isRestricted: true,
          errorMessage: 'Tab not found or not accessible',
          error: error.message,
          timestamp: Date.now()
        };
      }
      
      const url = tabInfo.url || '';
      const isRestricted = isRestrictedUrl(url);
      
      const result = {
        tabId,
        url: url.substring(0, 100) + (url.length > 100 ? '...' : ''), // Truncate for logging
        fullUrl: url,
        isAccessible: !isRestricted,
        isRestricted,
        isExtensionPage: isExtensionPage(url),
        isBrowserInternalPage: isBrowserInternalPage(url),
        errorMessage: isRestricted ? getRestrictedUrlMessage(url) : null,
        tabInfo: {
          title: tabInfo.title,
          status: tabInfo.status,
          active: tabInfo.active
        },
        timestamp: Date.now()
      };
      
      if (isRestricted) {
        this.logger.info(`[TabPermissionChecker] Tab ${tabId} access restricted:`, result);
      } else {
        this.logger.debug(`[TabPermissionChecker] Tab ${tabId} is accessible:`, result);
      }
      
      return result;
    } catch (error) {
      this.logger.error(`[TabPermissionChecker] Error checking tab ${tabId} access:`, error);
      return {
        tabId,
        isAccessible: false,
        isRestricted: true,
        errorMessage: 'Unable to check tab accessibility',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Test if content script can be injected into a tab
   * @param {number} tabId - Tab ID to test
   * @returns {Promise<boolean>} True if content script can be injected
   */
  async canInjectContentScript(tabId) {
    const accessInfo = await this.checkTabAccess(tabId);
    return accessInfo.isAccessible;
  }
  
  /**
   * Get a list of accessible tabs
   * @param {Object} queryInfo - Tab query criteria (same as browser.tabs.query)
   * @returns {Promise<Array>} Array of accessible tabs with permission info
   */
  async getAccessibleTabs(queryInfo = {}) {
    try {
      const browser = globalThis.browser || globalThis.chrome;
      const tabs = await browser.tabs.query(queryInfo);
      
      const accessibleTabs = [];
      for (const tab of tabs) {
        const accessInfo = await this.checkTabAccess(tab.id);
        if (accessInfo.isAccessible) {
          accessibleTabs.push({
            ...tab,
            accessInfo
          });
        }
      }
      
      this.logger.debug(`[TabPermissionChecker] Found ${accessibleTabs.length}/${tabs.length} accessible tabs`);
      return accessibleTabs;
    } catch (error) {
      this.logger.error('[TabPermissionChecker] Error getting accessible tabs:', error);
      return [];
    }
  }
}

// Create singleton instance for background usage
export const tabPermissionChecker = new TabPermissionChecker();