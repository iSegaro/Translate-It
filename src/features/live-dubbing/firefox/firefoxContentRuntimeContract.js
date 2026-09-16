/**
 * Closed readiness/discovery contract for the Firefox content runtime.
 *
 * This is intentionally separate from Live Dubbing control messages. The
 * payload carries only an optional challenge nonce; tab/frame/document
 * identity is supplied by the native MessageSender at Background ingress.
 */

export const FIREFOX_CONTENT_RUNTIME_TARGET = 'live-dubbing-firefox-content-runtime';

export const FIREFOX_CONTENT_RUNTIME_ACTIONS = Object.freeze({
  READY: 'FIREFOX_CONTENT_RUNTIME_READY',
  DISCOVER: 'FIREFOX_CONTENT_RUNTIME_DISCOVER',
});

export const FIREFOX_CONTENT_RUNTIME_READY_ACTION = FIREFOX_CONTENT_RUNTIME_ACTIONS.READY;
export const FIREFOX_CONTENT_RUNTIME_DISCOVERY_ACTION = FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER;

const allowedKeys = new Set(['target', 'action', 'data']);
const allowedDataKeys = new Set(['nonce']);
const NONCE_LIMIT = 256;

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function normalizeNonce(value) {
  if (typeof value !== 'string') return null;
  const nonce = value.trim();
  return nonce && nonce.length <= NONCE_LIMIT ? nonce : null;
}

function createMessage(action, nonce = null) {
  if (action !== FIREFOX_CONTENT_RUNTIME_ACTIONS.READY
    && action !== FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER) {
    throw new TypeError('Unsupported Firefox content runtime action');
  }
  const normalizedNonce = nonce === null || nonce === undefined ? null : normalizeNonce(nonce);
  if (action === FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER && !normalizedNonce) {
    throw new TypeError('Firefox content runtime discovery nonce is required');
  }
  if (nonce !== null && nonce !== undefined && !normalizedNonce) {
    throw new TypeError('Firefox content runtime nonce is invalid');
  }

  return {
    target: FIREFOX_CONTENT_RUNTIME_TARGET,
    action,
    data: normalizedNonce === null ? {} : { nonce: normalizedNonce },
  };
}

/**
 * Build the content→Background readiness message. A nonce is present only
 * when answering an active Background discovery challenge.
 * @param {string|null} nonce
 * @returns {{target: string, action: string, data: object}}
 */
export function createFirefoxContentRuntimeReadyMessage(nonce = null) {
  return createMessage(FIREFOX_CONTENT_RUNTIME_ACTIONS.READY, nonce);
}

/**
 * Build the Background→content discovery challenge.
 * @param {string} nonce
 * @returns {{target: string, action: string, data: {nonce: string}}}
 */
export function createFirefoxContentRuntimeDiscoveryMessage(nonce) {
  return createMessage(FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER, nonce);
}

/**
 * Parse either side of the readiness/discovery path. Unknown keys, nested
 * values, missing discovery nonces, and non-scalar payloads fail closed.
 * @param {unknown} message
 * @returns {{action: string, nonce: string|null}|null}
 */
export function parseFirefoxContentRuntimeMessage(message) {
  if (!isPlainRecord(message)
    || message.target !== FIREFOX_CONTENT_RUNTIME_TARGET
    || !Object.keys(message).every(key => allowedKeys.has(key))
    || !isPlainRecord(message.data)
    || !Object.keys(message.data).every(key => allowedDataKeys.has(key))) {
    return null;
  }

  const rawNonce = message.data.nonce;
  const nonce = rawNonce === undefined || rawNonce === null ? null : normalizeNonce(rawNonce);
  if (rawNonce !== undefined && rawNonce !== null && !nonce) return null;

  if (message.action === FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER && !nonce) return null;
  if (message.action !== FIREFOX_CONTENT_RUNTIME_ACTIONS.READY
    && message.action !== FIREFOX_CONTENT_RUNTIME_ACTIONS.DISCOVER) return null;

  return { action: message.action, nonce };
}
