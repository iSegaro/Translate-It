// src/background/handlers/common/handlePing.js
import { logME } from '../../../utils/core/helpers.js';

/**
 * Handles the 'ping' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - Returns a promise for webextension-polyfill compatibility.
 */
export async function handlePing() {
  logME("[Handler:Common] Ping received, responding with pong");
  const response = { success: true, message: "pong" };
  logME("[Handler:Common] Returning pong response:", response);
  return response;
}