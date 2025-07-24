// src/utils/browser-polyfill.js
// Legacy browser polyfill - now uses unified API
// Provides backward compatibility for existing code

import { getBrowserAPI } from './browser-unified.js';

// Initialize browser API
let Browser = null;
let initializationPromise = null;

// Get initialization promise (can be called multiple times)
function getInitializationPromise() {
  if (!initializationPromise) {
    initializationPromise = getBrowserAPI().then(api => {
      Browser = api;
      return api;
    });
  }
  return initializationPromise;
}

// For async use
export async function getBrowserAsync() {
  if (Browser) {
    return Browser;
  }
  
  return await getInitializationPromise();
}

// Legacy export - will be populated after initialization


export function getBrowser() {
  return Browser;
}

// Initialize browser API and make globally available
getInitializationPromise().then(api => {
  // Make globally available for legacy code
  if (typeof globalThis !== 'undefined') {
    globalThis.Browser = api;
    globalThis.browser = api;
  }
  
  // For service worker context
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.Browser = api;
    self.browser = api;
  }
  
  // For window context
  if (typeof window !== 'undefined') {
    window.Browser = api;
    window.browser = api;
  }
}).catch(error => {
  console.error('Failed to initialize browser API:', error);
});

// Export the promise for code that needs to wait for initialization
export const browserAPIReady = getInitializationPromise();
