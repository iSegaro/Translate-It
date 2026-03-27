// src/utils/browserCompat.js
// browser compatibility utilities

import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import browser from "webextension-polyfill";

// Lazy logger initialization to avoid TDZ
let logger = null;
let loggerPromise = null;
const getLogger = () => {
  if (!logger) {
    if (!loggerPromise) {
      loggerPromise = Promise.all([
        import('@/shared/logging/logger.js'),
        import('@/shared/logging/logConstants.js')
      ]).then(([loggerModule, logConstantsModule]) => {
        logger = loggerModule.getScopedLogger(logConstantsModule.LOG_COMPONENTS.BROWSER, 'compatibility');
        return logger;
      });
    }
    // Return a temporary logger that buffers calls until the real logger is loaded
    return {
      debug: (...args) => loggerPromise.then(l => l.debug(...args)),
      info: (...args) => loggerPromise.then(l => l.info(...args)),
      warn: (...args) => loggerPromise.then(l => l.warn(...args)),
      error: (...args) => loggerPromise.then(l => l.error(...args))
    };
  }
  return logger;
};

/**
 * OS Platforms Constants
 */
export const OS_PLATFORMS = {
  MAC: 'MAC',
  WINDOWS: 'WINDOWS',
  LINUX: 'LINUX',
  UNKNOWN: 'UNKNOWN'
};

/**
 * Modern browser detection without deprecated APIs
 * Detect if we're running in Firefox
 */
export async function isFirefox() {
  try {
    // Method 1: Use webextension-polyfill browser.runtime.getBrowserInfo() if available
    if (typeof browser !== "undefined" && browser.runtime && browser.runtime.getBrowserInfo) {
      try {
        const browserInfo = await browser.runtime.getBrowserInfo();
        return browserInfo.name.toLowerCase() === "firefox";
      } catch (error) {
        // getBrowserInfo might not be available in all contexts
        getLogger().debug('[browserCompat] getBrowserInfo not available:', error);
      }
    }
    
    // Method 2: Check for Firefox-specific APIs that are not deprecated
    if (typeof browser !== "undefined" && browser.runtime) {
      const manifest = browser.runtime.getManifest();
      if (manifest && manifest.manifest_version === 3) {
        const hasFirefoxSpecificAPI = 
          browser.sidebarAction || 
          (browser.contextMenus && browser.contextMenus.OverrideContext);
        if (hasFirefoxSpecificAPI) {
          return true;
        }
      }
    }
    
    // Method 3: User agent detection (most reliable fallback)
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      return navigator.userAgent.includes("Firefox");
    }
    
    return typeof chrome === "undefined";
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    handler.handle(error, { type: ErrorTypes.CONTEXT, context: 'browserCompat-isFirefox' });
    return false;
  }
}

/**
 * Detect if we're running in Edge
 */
export async function isEdge() {
  if (typeof navigator !== "undefined" && navigator.userAgent) {
    return navigator.userAgent.includes("Edg");
  }
  return false;
}

/**
 * Detect if we're running in Chrome
 */
export async function isChrome() {
  const firefox = await isFirefox();
  const edge = await isEdge();
  return !firefox && !edge;
}

/**
 * Detect Operating System
 * @returns {string} One of OS_PLATFORMS
 */
export function detectOS() {
  if (typeof navigator === 'undefined') {
    return OS_PLATFORMS.UNKNOWN;
  }
  const platform = navigator.platform.toLowerCase();
  if (platform.startsWith('mac')) {
    return OS_PLATFORMS.MAC;
  }
  if (platform.startsWith('win')) {
    return OS_PLATFORMS.WINDOWS;
  }
  if (platform.includes('linux')) {
    return OS_PLATFORMS.LINUX;
  }
  return OS_PLATFORMS.UNKNOWN;
}

/**
 * Device and Touch detection (formerly deviceDetector)
 */
export const deviceDetector = {
  isMobile() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || navigator.vendor || (window && window.opera) || "";
    // Standard mobile UA detection
    const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    
    // iPadOS detection (often reports as MacIntel but with touch)
    const isIPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

    // In extension context (popups/sidepanels), innerWidth is always small.
    // We should NOT rely on width + touch for mobile detection here as it hits touch-enabled desktops.
    return isMobileUA || isIPadOS;
  },

  isTouchDevice() {
    if (typeof navigator === 'undefined') return false;
    return (typeof window !== 'undefined' && 'ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  },

  shouldEnableMobileUI() {
    return this.isMobile();
  }
};

/**
 * Get unified browser, OS, and device information (Synchronous)
 * @returns {Object} Comprehensive info object
 */
export function getBrowserInfoSync() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isFirefoxSync = ua.includes('Firefox');
  const isEdgeSync = ua.includes('Edg');
  const isMobileSync = deviceDetector.isMobile();
  const isChromeSync = ua.includes('Chrome') && !isEdgeSync && !isFirefoxSync;
  const os = detectOS();

  return {
    isFirefox: isFirefoxSync,
    isMobile: isMobileSync,
    isChrome: isChromeSync,
    isEdge: isEdgeSync,
    isTouch: deviceDetector.isTouchDevice(),
    os: os,
    name: isFirefoxSync ? 'Firefox' : (isEdgeSync ? 'Edge' : (isChromeSync ? 'Chrome' : 'Unknown'))
  };
}


// Legacy TTS manager functions removed - using unified GOOGLE_TTS_SPEAK system