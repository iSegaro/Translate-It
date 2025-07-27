// src/background/handlers/common/handlePing.js
import { logME } from '../../../utils/helpers.js';

/**
 * Handles the 'ping' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @param {Function} sendResponse - The function to send a response back.
 * @returns {boolean} - False for synchronous response.
 */
export function handlePing(message, sender, sendResponse) {
  logME("[Handler:Common] Ping received, responding with pong");
  sendResponse({ success: true, message: "pong" });
  return false; // Synchronous response
}
