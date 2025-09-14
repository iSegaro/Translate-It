// src/core/browserHandlers.js
// Provides functions to add handlers based on browser capabilities

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CORE, 'BrowserHandlers');

/**
 * Detect if current browser supports Chromium features (Chrome, Edge, Opera, etc.)
 * @returns {boolean} True if Chromium-based, false otherwise
 */
export const isChromium = () => {
  // Check for Chromium-based browsers (Chrome, Edge, Opera, Brave, etc.)
  return /chrome/i.test(navigator.userAgent || '') || 
         /chromium/i.test(navigator.userAgent || '') ||
         /edg/i.test(navigator.userAgent || '') ||  // Modern Edge
         /opera|opr/i.test(navigator.userAgent || '');
};

/**
 * Detect if current browser is Chrome specifically
 * @returns {boolean} True if Chrome, false otherwise  
 */
export const isChrome = () => {
  return /chrome/i.test(navigator.userAgent || '') && 
         !/edge/i.test(navigator.userAgent || '') &&
         !/edg/i.test(navigator.userAgent || '') &&
         !/opera|opr/i.test(navigator.userAgent || '');
};

/**
 * Detect if current browser is Firefox
 * @returns {boolean} True if Firefox, false otherwise
 */
export const isFirefox = () => {
  return /firefox/i.test(navigator.userAgent || '');
};

/**
 * Add Chromium-specific handlers to the handler mappings
 * @param {Object} handlerMappings - Handler mappings object to modify
 * @param {Object} Handlers - Available handlers object
 */
export const addChromiumSpecificHandlers = (handlerMappings, Handlers) => {
  if (isChromium()) {
    // OFFSCREEN_READY is needed in all Chromium-based browsers (Chrome, Edge, Opera, etc.)
    handlerMappings['OFFSCREEN_READY'] = Handlers.handleOffscreenReady;
    logger.debug('🟢 [Chromium] Added OFFSCREEN_READY handler for Chromium offscreen documents');
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
export const addBrowserSpecificHandlers = (handlerMappings, Handlers) => {
  logger.debug('🌐 Adding browser-specific handlers...');

  addChromiumSpecificHandlers(handlerMappings, Handlers);
  addFirefoxSpecificHandlers(handlerMappings, Handlers);

  logger.debug('✅ Browser-specific handlers added');
};