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
  // Method 1: Check for global defined constants (most reliable across all contexts)
  if (typeof __IS_DEVELOPMENT__ !== 'undefined') {
    return !!__IS_DEVELOPMENT__;
  }

  // Method 2: Check for standard Vite development flag
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      return true;
    }
  } catch { /* Safe fallback */ }
  
  // Method 3: Check Extension development mode (Unpacked)
  try {
    // Works for both Chrome (chrome) and Firefox (browser) namespaces
    const manifest = (globalThis.chrome || globalThis.browser)?.runtime?.getManifest?.();

    // Unpacked extensions usually don't have update_url
    if (manifest && !manifest.update_url) {
      return true; 
    }
  } catch {
    // Safe fallback for non-extension environments
  }
  
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
    
    // Content script context (injected into web pages or local files)
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:' || window.location.protocol === 'file:') {
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
