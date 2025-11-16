// src/core/tabPermissions.js
// Tab permissions and accessibility utilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'TabPermissions');

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
    // Note: file:// is removed from restricted prefixes to allow local file access
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
 * Check if a URL is a local file
 * @param {string} url - The URL to check
 * @returns {boolean} True if it's a local file
 */
export function isLocalFile(url) {
  if (!url || typeof url !== 'string') return false;

  return url.toLowerCase().startsWith('file://');
}

/**
 * Check if a local file is safe to access
 * @param {string} url - The file URL to check
 * @returns {boolean} True if the file is safe to access
 */
export function isSafeLocalFile(url) {
  if (!isLocalFile(url)) return false;

  try {
    // Simple check - if user opens the file, let's trust them
    logger.debug(`[TabPermissions] Local file allowed: ${url}`);
    return true;

  } catch (error) {
    logger.error('[TabPermissions] Error checking local file safety:', error);
    return false;
  }
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

  if (isLocalFile(url)) {
    if (!isSafeLocalFile(url)) {
      return 'File type blocked for security reasons';
    }
    return 'Local file access is enabled';
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
    let isRestricted = isRestrictedUrl(url);
    let errorMessage = null;

    // Special handling for local files
    if (isLocalFile(url)) {
      // Check if the local file is safe
      const isSafe = isSafeLocalFile(url);
      isRestricted = !isSafe;
      if (!isSafe) {
        errorMessage = 'File type blocked for security reasons';
        logger.warn(`[TabPermissions] Unsafe local file blocked: ${url}`);
      } else {
        logger.info(`[TabPermissions] Safe local file allowed: ${url}`);
      }
    }

    const result = {
      url,
      isAccessible: !isRestricted,
      isRestricted,
      isLocalFile: isLocalFile(url),
      isSafeLocalFile: isLocalFile(url) ? isSafeLocalFile(url) : null,
      isExtensionPage: isExtensionPage(url),
      isBrowserInternalPage: isBrowserInternalPage(url),
      errorMessage: isRestricted ? (errorMessage || getRestrictedUrlMessage(url)) : null,
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
  this.logger = getScopedLogger(LOG_COMPONENTS.CORE, 'TabPermissionChecker');
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
      let isRestricted = isRestrictedUrl(url);
      let errorMessage = null;

      // Special handling for local files
      if (isLocalFile(url)) {
        // Check if the local file is safe
        const isSafe = isSafeLocalFile(url);
        isRestricted = !isSafe;
        if (!isSafe) {
          errorMessage = 'File type blocked for security reasons';
          this.logger.warn(`[TabPermissionChecker] Unsafe local file blocked: ${url}`);
        } else {
          this.logger.info(`[TabPermissionChecker] Safe local file allowed: ${url}`);
        }
      }

      const result = {
        tabId,
        url: url.substring(0, 100) + (url.length > 100 ? '...' : ''), // Truncate for logging
        fullUrl: url,
        isAccessible: !isRestricted,
        isRestricted,
        isLocalFile: isLocalFile(url),
        isSafeLocalFile: isLocalFile(url) ? isSafeLocalFile(url) : null,
        isExtensionPage: isExtensionPage(url),
        isBrowserInternalPage: isBrowserInternalPage(url),
        errorMessage: isRestricted ? (errorMessage || getRestrictedUrlMessage(url)) : null,
        tabInfo: {
          title: tabInfo.title,
          status: tabInfo.status,
          active: tabInfo.active
        },
        timestamp: Date.now()
      };

      // if (isRestricted) {
      //   this.logger.info(`[TabPermissionChecker] Tab ${tabId} access restricted:`, result);
      // } else {
      //   this.logger.debug(`[TabPermissionChecker] Tab ${tabId} is accessible:`, result);
      // }

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