// src/background/handlers/common/handlePing.js

import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';
const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'handlePing');


/**
 * Handles the 'ping' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Returns a promise for webextension-polyfill compatibility.
 */
export async function handlePing() {
  logger.debug('Ping received, responding with pong');
  const response = { success: true, message: "pong" };
  logger.debug('Returning pong response:', response);
  return response;
}