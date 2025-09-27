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
      // Firefox has different manifest structure and API availability
      const manifest = browser.runtime.getManifest();
      if (manifest && manifest.manifest_version === 3) {
        // Firefox MV3 specific checks
        const hasFirefoxSpecificAPI = 
          browser.sidebarAction || // Firefox has sidebarAction instead of sidePanel
          (browser.contextMenus && browser.contextMenus.OverrideContext); // Firefox-specific enum
        if (hasFirefoxSpecificAPI) {
          return true;
        }
      }
    }
    
    // Method 3: User agent detection (most reliable fallback)
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      return navigator.userAgent.includes("Firefox");
    }
    
    // Method 4: Chrome API presence check (inverse detection)
    if (typeof chrome === "undefined") {
      // If chrome global is not available, likely Firefox with polyfill
      return true;
    }
    
    return false;
  } catch (error) {
    const handler = ErrorHandler.getInstance();
    handler.handle(error, { type: ErrorTypes.CONTEXT, context: 'browserCompat-isFirefox' });
    return false;
  }
}

/**
 * Detect if we're running in Chrome
 */
export async function isChrome() {
  return !(await isFirefox());
}

// Legacy TTS manager functions removed - using unified GOOGLE_TTS_SPEAK system