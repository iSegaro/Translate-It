// src/utils/browserCompat.js
// browser compatibility utilities

import { ErrorHandler } from "@/shared/error-management/ErrorHandler.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import browser from "webextension-polyfill";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isMobile, isTouchDevice } from '@/shared/utils/device.js';

const logger = getScopedLogger(LOG_COMPONENTS.BROWSER, 'compatibility');

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
 * Site Platforms Constants (Websites with special handling)
 */
export const SITE_PLATFORMS = {
  Twitter: 'twitter',
  WhatsApp: 'whatsapp',
  Instagram: 'instagram',
  Telegram: 'telegram',
  Medium: 'medium',
  ChatGPT: 'chatgpt',
  Youtube: 'youtube',
  Discord: 'discord',
  Default: 'default'
};

/**
 * Detect current site platform based on hostname
 * @returns {string} One of SITE_PLATFORMS
 */
export function detectSite() {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) {
    return SITE_PLATFORMS.Default;
  }
  
  const hostname = window.location.hostname.toLowerCase();
  
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return SITE_PLATFORMS.Twitter;
  if (hostname.includes('whatsapp.com')) return SITE_PLATFORMS.WhatsApp;
  if (hostname.includes('instagram.com')) return SITE_PLATFORMS.Instagram;
  if (hostname.includes('web.telegram.org') || hostname.includes('t.me')) return SITE_PLATFORMS.Telegram;
  if (hostname.includes('medium.com')) return SITE_PLATFORMS.Medium;
  if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) return SITE_PLATFORMS.ChatGPT;
  if (hostname.includes('youtube.com')) return SITE_PLATFORMS.Youtube;
  if (hostname.includes('discord.com')) return SITE_PLATFORMS.Discord;
  
  return SITE_PLATFORMS.Default;
}

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
    return isMobile;
  },

  isTouchDevice() {
    return isTouchDevice;
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