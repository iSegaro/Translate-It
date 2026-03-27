// src/core/browserHandlers.js
// Provides functions to add handlers based on browser capabilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { isFirefox as checkIsFirefox, isChrome as checkIsChrome, isEdge as checkIsEdge, getBrowserInfoSync } from '@/utils/browser/compatibility.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'BrowserHandlers');

/**
 * Detect if current browser supports Chromium features (Chrome, Edge, Opera, etc.)
 * @returns {boolean} True if Chromium-based, false otherwise
 */
export const isChromium = () => {
  const info = getBrowserInfoSync();
  return info.isChrome || info.isEdge || /chromium|opera|opr/i.test(navigator.userAgent || '');
};

/**
 * Detect if current browser is Chrome specifically
 * @returns {boolean} True if Chrome, false otherwise  
 */
export const isChrome = () => {
  return getBrowserInfoSync().isChrome;
};

/**
 * Detect if current browser is Firefox
 * @returns {boolean} True if Firefox, false otherwise
 */
export const isFirefox = () => {
  return getBrowserInfoSync().isFirefox;
};

/**
 * Add Chromium-specific handlers to the handler mappings
 * @param {Object} handlerMappings - Handler mappings object to modify
 * @param {Object} Handlers - Available handlers object
 */
export const addChromiumSpecificHandlers = () => {
  if (isChromium()) {
    // OFFSCREEN_READY is needed in all Chromium-based browsers (Chrome, Edge, Opera, etc.)
    // Note: Already mapped in LifecycleManager, no need to add again
    logger.debug('🟢 [Chromium] OFFSCREEN_READY handler already configured for Chromium offscreen documents');
  } else {
    logger.debug('🟠 [Firefox/Other] Skipped OFFSCREEN_READY handler (not needed for direct audio)');
  }
};

/**
 * Add Firefox-specific handlers to the handler mappings
 * @param {Object} handlerMappings - Handler mappings object to modify
 * @param {Object} Handlers - Available handlers object
 */
export const addFirefoxSpecificHandlers = () => {
  if (isFirefox()) {
    // Currently no Firefox-specific handlers
    logger.debug('🦊 [Firefox] No Firefox-specific handlers to add');
  }
};

/**
 * Add all browser-specific handlers to the handler mappings
 * @param {Object} handlerMappings - Handler mappings object to modify
 * @param {Object} Handlers - Available handlers object
 */
export const addBrowserSpecificHandlers = () => {
  logger.debug('🌐 Adding browser-specific handlers...');

  addChromiumSpecificHandlers();
  addFirefoxSpecificHandlers();

  logger.debug('✅ Browser-specific handlers added');
};