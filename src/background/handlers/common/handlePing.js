// src/background/handlers/common/handlePing.js

import { createLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

// Lazy logger to avoid initialization order issues
let _logger;
const getLogger = () => {
  if (!_logger) {
    _logger = createLogger(LOG_COMPONENTS.BACKGROUND, 'handlePing');
  }
  return _logger;
};


/**
 * Handles the 'ping' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Returns a promise for webextension-polyfill compatibility.
 */
export async function handlePing() {
  getLogger().debug('Ping received, responding with pong');
  const response = { success: true, message: "pong" };
  getLogger().debug('Returning pong response:', response);
  return response;
}