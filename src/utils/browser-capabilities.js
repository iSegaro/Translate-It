// src/utils/browser-capabilities.js
// Browser-specific capabilities and feature detection

/**
 * Defines browser-specific capabilities and workarounds
 * This helps handle differences between Chrome and Firefox in MV3
 */
export const BrowserCapabilities = {
  chrome: {
    manifestVersion: 3,
    
    // Service Worker Support
    hasServiceWorker: true,
    hasPersistentBackground: false,
    
    // Chrome-specific APIs
    hasOffscreenAPI: true,
    hasSidePanelAPI: true,
    hasTTSAPI: true,
    hasScreenCaptureAPI: true,
    
    // Audio/TTS handling method
    ttsMethod: 'offscreen-document',
    audioMethod: 'offscreen-document',
    
    // Panel system
    panelSystem: 'side_panel',
    
    // Permissions
    specificPermissions: ['offscreen', 'sidePanel', 'tts'],
    
    // Chrome-specific workarounds
    workarounds: {
      tts: 'use-offscreen-document',
      audio: 'use-offscreen-document',
      screenCapture: 'use-offscreen-api',
      backgroundExecution: 'service-worker-only'
    },
    
    // Manifest-specific configurations
    manifest: {
      background: {
        service_worker: true,
        persistent: false,
        type: 'module'
      },
      panelKey: 'side_panel',
      contextMenusInBackground: true
    }
  },

  firefox: {
    manifestVersion: 3,
    
    // Firefox MV3 is still evolving
    hasServiceWorker: true,
    hasPersistentBackground: true, // Still needed for some features
    
    // Firefox API limitations in MV3
    hasOffscreenAPI: false, // Not yet supported
    hasSidePanelAPI: false, // Uses sidebar_action instead
    hasTTSAPI: false, // Limited support
    hasScreenCaptureAPI: true,
    
    // Audio/TTS handling method
    ttsMethod: 'background-page', // Fallback to background page
    audioMethod: 'background-page',
    
    // Panel system
    panelSystem: 'sidebar_action',
    
    // Permissions (Firefox-specific)
    specificPermissions: [], // No offscreen, sidePanel
    
    // Firefox-specific workarounds
    workarounds: {
      tts: 'use-background-page-with-audio',
      audio: 'use-background-page-audio-api',
      screenCapture: 'use-content-script-injection',
      offscreen: 'use-background-page-iframe',
      backgroundExecution: 'persistent-background-page'
    },
    
    // Manifest-specific configurations
    manifest: {
      background: {
        service_worker: false,
        scripts: true, // Use scripts array
        persistent: false, // Try non-persistent first
        type: 'module'
      },
      panelKey: 'sidebar_action',
      contextMenusInBackground: true,
      
      // Firefox-specific settings
      browser_specific_settings: {
        gecko: {
          id: 'translate-it@anthropic.com',
          strict_min_version: '109.0' // MV3 support starts here
        }
      }
    }
  }
};

/**
 * Gets browser capabilities based on runtime detection
 * @returns {Object} Browser capabilities object
 */
export function getBrowserCapabilities() {
  // Detect browser type
  const isFirefox = typeof browser !== 'undefined' && 
                   browser.runtime && 
                   browser.runtime.getBrowserInfo;
  
  const isChrome = typeof chrome !== 'undefined' && 
                  chrome.runtime && 
                  chrome.runtime.getManifest;
  
  if (isFirefox) {
    return BrowserCapabilities.firefox;
  } else if (isChrome) {
    return BrowserCapabilities.chrome;
  } else {
    // Fallback to Chrome capabilities
    console.warn('Unknown browser, defaulting to Chrome capabilities');
    return BrowserCapabilities.chrome;
  }
}

/**
 * Gets the current browser name
 * @returns {string} 'chrome' | 'firefox' | 'unknown'
 */
export function getBrowserName() {
  const isFirefox = typeof browser !== 'undefined' && 
                   browser.runtime && 
                   browser.runtime.getBrowserInfo;
  
  if (isFirefox) return 'firefox';
  
  const isChrome = typeof chrome !== 'undefined' && 
                  chrome.runtime && 
                  chrome.runtime.getManifest;
  
  if (isChrome) return 'chrome';
  
  return 'unknown';
}

/**
 * Checks if a specific feature is supported in the current browser
 * @param {string} feature - Feature name to check
 * @returns {boolean} Whether the feature is supported
 */
export function isFeatureSupported(feature) {
  const capabilities = getBrowserCapabilities();
  
  switch (feature) {
    case 'offscreen':
      return capabilities.hasOffscreenAPI;
    case 'sidePanel':
      return capabilities.hasSidePanelAPI;
    case 'tts':
      return capabilities.hasTTSAPI;
    case 'persistentBackground':
      return capabilities.hasPersistentBackground;
    case 'serviceWorker':
      return capabilities.hasServiceWorker;
    default:
      console.warn(`Unknown feature: ${feature}`);
      return false;
  }
}

/**
 * Gets the appropriate workaround method for a feature
 * @param {string} feature - Feature name
 * @returns {string} Workaround method
 */
export function getWorkaroundMethod(feature) {
  const capabilities = getBrowserCapabilities();
  return capabilities.workarounds[feature] || 'not-supported';
}

/**
 * Gets browser-specific permissions
 * @returns {Array<string>} Array of browser-specific permissions
 */
export function getBrowserSpecificPermissions() {
  const capabilities = getBrowserCapabilities();
  return capabilities.specificPermissions || [];
}

/**
 * Gets the appropriate panel system for the browser
 * @returns {string} Panel system name
 */
export function getPanelSystem() {
  const capabilities = getBrowserCapabilities();
  return capabilities.panelSystem;
}

/**
 * Gets manifest configuration for the current browser
 * @returns {Object} Manifest configuration object
 */
export function getManifestConfig() {
  const capabilities = getBrowserCapabilities();
  return capabilities.manifest;
}