/**
 * Background Coordinator addressing for the Firefox content-runtime host.
 *
 * Targeted one-shot Background→content sends with exact
 * session/provider/tab/frame/document/event identity. Disappearance (missing
 * receiver, stale document, transport rejection, timeout, or inexact
 * response) maps to a bounded controlled failure — never a throw and never
 * a false success. The Chrome offscreen/tabCapture path is untouched.
 */

import {
  LIVE_DUBBING_STATUS_TIMEOUT,
} from '../constants.js';
import {
  isFirefoxContentDescriptor,
} from '../contracts.js';
import {
  hasExactFirefoxContentEvent,
  isExactFirefoxContentResponse,
  parseFirefoxContentMessage,
  sanitizeFirefoxContentResponse,
} from './firefoxContentContract.js';

export const FIREFOX_CONTENT_SEND_TIMEOUT_MS = LIVE_DUBBING_STATUS_TIMEOUT;
export const FIREFOX_CONTENT_UNAVAILABLE = 'LIVE_DUBBING_CONTENT_UNAVAILABLE';
export const FIREFOX_CONTENT_SESSION_MISMATCH = 'LIVE_DUBBING_SESSION_MISMATCH';

function failure(descriptor, error) {
  const sessionId = typeof descriptor?.sessionId === 'string' && descriptor.sessionId.trim()
    ? descriptor.sessionId
    : null;
  const providerId = typeof descriptor?.providerId === 'string' ? descriptor.providerId : null;
  return { success: false, error, sessionId, providerId };
}

/**
 * Resolve the exact content target for a Firefox-owned descriptor.
 * Returns null for anything inexact so the caller fails closed without
 * sending.
 * @param {object} descriptor owning descriptor
 * @returns {{tabId: number, frameId: number, documentId: string}|null}
 */
export function getFirefoxContentTarget(descriptor) {
  if (!isFirefoxContentDescriptor(descriptor)) return null;
  if (!Number.isInteger(descriptor.tabId) || descriptor.tabId < 0) return null;
  if (!Number.isInteger(descriptor.frameId) || descriptor.frameId < 0) return null;
  if (typeof descriptor.documentId !== 'string' || !descriptor.documentId.trim()) return null;
  return {
    tabId: descriptor.tabId,
    frameId: descriptor.frameId,
    documentId: descriptor.documentId.trim(),
  };
}

/**
 * Send one closed control message to the exact addressed document.
 * The message must echo the descriptor identity exactly, otherwise no send
 * happens. Responses are re-sanitized and must echo the same identity;
 * anything else is a controlled failure, never a success.
 * @param {object|null} browserAPI extension browser API
 * @param {object} descriptor Firefox-owned descriptor
 * @param {object} message closed control message
 * @param {{timeoutMs?: number}} options bounded disappearance wait
 * @returns {Promise<object>} sanitized host response or controlled failure
 */
export async function sendFirefoxContentMessage(browserAPI, descriptor, message, options = {}) {
  const target = getFirefoxContentTarget(descriptor);
  const parsed = parseFirefoxContentMessage(message);
  if (!target || !parsed || !hasExactFirefoxContentEvent(parsed, descriptor)) {
    return failure(descriptor, FIREFOX_CONTENT_SESSION_MISMATCH);
  }

  const sendMessage = browserAPI?.tabs?.sendMessage;
  if (typeof sendMessage !== 'function') {
    return failure(descriptor, FIREFOX_CONTENT_UNAVAILABLE);
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0
    ? options.timeoutMs
    : FIREFOX_CONTENT_SEND_TIMEOUT_MS;

  let timeoutId;
  try {
    const pending = Promise.resolve()
      .then(() => sendMessage.call(browserAPI.tabs, target.tabId, message, {
        frameId: target.frameId,
        documentId: target.documentId,
      }))
      .then(
        value => ({ settled: true, value }),
        () => ({ settled: false }),
      );
    const timeout = new Promise(resolve => {
      timeoutId = setTimeout(() => resolve({ settled: false, timedOut: true }), timeoutMs);
    });
    const outcome = await Promise.race([pending, timeout]);
    if (!outcome?.settled) {
      return failure(descriptor, FIREFOX_CONTENT_UNAVAILABLE);
    }

    const sanitized = sanitizeFirefoxContentResponse(outcome.value);
    if (!sanitized || !isExactFirefoxContentResponse(sanitized, descriptor)) {
      return failure(descriptor, FIREFOX_CONTENT_SESSION_MISMATCH);
    }
    return sanitized;
  } catch {
    return failure(descriptor, FIREFOX_CONTENT_UNAVAILABLE);
  } finally {
    clearTimeout(timeoutId);
  }
}
