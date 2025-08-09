// src/utils/browserCompat.js
// browser compatibility utilities

import { ErrorHandler } from "../../error-management/ErrorService.js";
import { ErrorTypes } from "../../error-management/ErrorTypes.js";
import browser from "webextension-polyfill";
import { createLogger } from '@/utils/core/logger.js';

const logger = createLogger('Core', 'compatibility');

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
        logger.debug('[browserCompat] getBrowserInfo not available:', error);
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

/**
 * Get the appropriate TTS manager for the current browser
 */
export async function getTTSManager() {
  try {
    if (await isFirefox()) {
      // Use Firefox-compatible TTS manager
      const module = await import(
        /* webpackChunkName: "tts-firefox" */ "@/managers/browser-specific/tts/TTSFirefox.js"
      );
      return module;
    } else {
      // Use Chrome TTS manager with offscreen support
      const module = await import(
        /* webpackChunkName: "tts-chrome" */ "@/managers/browser-specific/tts/TTSChrome.js"
      );
      return module;
    }
  } catch (error) {
    logger.error("[browserCompat] Error loading TTS manager:", error);
    // No fallback available - TTS functionality will not be available
    throw new Error("TTS functionality is not available in this browser context");
  }
}

/**
 * Get browser-specific TTS utilities
 * Note: TTS utilities are now integrated into TTS managers
 * This function is kept for backward compatibility
 */
export async function getTTSUtils() {
  logger.warn("[browserCompat] getTTSUtils is deprecated. Use getTTSManager instead.");
  return await getTTSManager();
}