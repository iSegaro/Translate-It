// src/background/handlers/common/handlePing.js
import { logME } from '../../../utils/helpers.js';

/**
 * Handles the 'ping' message action.
 * @param {Object} message - The message object.
 * @param {Object} sender - The sender object.
 * @returns {Promise<Object>} - A Promise that resolves with the response object.
 */
export async function handlePing(message, sender) {
  logME("[Handler:Common] Ping received, responding with pong");
  return { success: true, message: "pong" };
}