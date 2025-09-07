/**
 * Environment Detection Utilities
 * Safe environment detection that works in all contexts (content scripts, service workers, etc.)
 */

/**
 * Safely detect if we're in development mode
 * Works in both service worker and content script contexts
 * @returns {boolean} true if in development mode
 */
export function isDevelopmentMode() {
  // Try different methods to detect development mode
  
  // Method 1: Check for Vite dev mode indicators
  if (typeof globalThis !== 'undefined' && globalThis.__VITE_DEV__) {
    return true;
  }
  
  // Method 2: Check for development-specific global flags
  if (typeof globalThis !== 'undefined' && globalThis.__DEV__) {
    return true;
  }
  
  // Method 3: Check Chrome extension development mode
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) {
      const manifest = chrome.runtime.getManifest();
      // Development extensions often have 'unpacked' in the ID or specific flags
      if (manifest.update_url === undefined) {
        return true; // Unpacked extensions don't have update_url
      }
    }
  } catch (e) {
    // Ignore errors - might not be available in all contexts
  }
  
  // Method 4: Check user agent for development indicators
  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    if (navigator.userAgent.includes('Development')) {
      return true;
    }
  }
  
  // Default to production mode for safety
  return false;
}

/**
 * Detect the current execution context
 * @returns {string} 'service-worker', 'content-script', 'popup', 'options', or 'unknown'
 */
export function getExecutionContext() {
  // Service Worker context
  if (typeof importScripts === 'function' && typeof document === 'undefined') {
    return 'service-worker';
  }
  
  // DOM contexts
  if (typeof document !== 'undefined') {
    // Popup context
    if (typeof chrome !== 'undefined' && chrome.extension && window.location.protocol === 'chrome-extension:') {
      if (window.location.pathname.includes('popup')) {
        return 'popup';
      }
      if (window.location.pathname.includes('options')) {
        return 'options';
      }
      if (window.location.pathname.includes('sidepanel')) {
        return 'sidepanel';
      }
    }
    
    // Content script context (injected into web pages)
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return 'content-script';
    }
  }
  
  return 'unknown';
}

/**
 * Check if DOM APIs are available
 * @returns {boolean} true if document and window are available
 */
export function isDOMAvailable() {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/**
 * Check if we're in a service worker context
 * @returns {boolean} true if in service worker
 */
export function isServiceWorker() {
  return getExecutionContext() === 'service-worker';
}

/**
 * Check if we're in a content script context
 * @returns {boolean} true if in content script
 */
export function isContentScript() {
  return getExecutionContext() === 'content-script';
}

/**
 * Safe way to access extension APIs
 * @returns {object|null} chrome or browser API object, or null if not available
 */
export function getExtensionAPI() {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return chrome;
  }
  if (typeof browser !== 'undefined' && browser.runtime) {
    return browser;
  }
  return null;
}

/**
 * Get debug configuration based on context and environment
 * @returns {object} debug configuration object
 */
export function getDebugConfig() {
  const isDev = isDevelopmentMode();
  const context = getExecutionContext();
  
  return {
    enabled: isDev,
    context: context,
    domAvailable: isDOMAvailable(),
    serviceWorker: isServiceWorker(),
    contentScript: isContentScript(),
    extensionAPI: getExtensionAPI() !== null
  };
}