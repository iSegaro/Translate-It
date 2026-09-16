/**
 * Firefox-only bridge for the content-owned Live Dubbing controller.
 *
 * The bridge exposes only bootstrap and terminal callbacks. Both messages use
 * a dedicated Background contract and carry exact scalar session identity;
 * provider setup data is reduced to one ephemeral Gemini access token and
 * terminal diagnostics are intentionally not forwarded.
 */

import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_STATUS,
} from '../constants.js';
import {
  isLiveDubbingProviderId,
  normalizeProviderTargetLanguage,
} from '../contracts.js';

export const FIREFOX_CONTENT_BACKGROUND_TARGET = 'live-dubbing-firefox-background';

export const FIREFOX_CONTENT_BACKGROUND_ACTIONS = Object.freeze({
  REQUEST_BOOTSTRAP: 'FIREFOX_CONTENT_REQUEST_PROVIDER_BOOTSTRAP',
  TERMINAL: 'FIREFOX_CONTENT_TERMINAL',
});

const BOOTSTRAP_FAILURE = 'LIVE_DUBBING_PROVIDER_BOOTSTRAP_UNAVAILABLE';
const SAFE_EVENT = /^[A-Za-z0-9_.-]{1,80}$/;
const SAFE_ERROR = /^(?!.*(?:token|secret|credential|password|payload|media|stream))[A-Za-z0-9_.-]{1,80}$/i;
const FIREFOX_CONNECT_REQUEST_EVENT_SEQUENCE = 2;
const FIREFOX_BOOTSTRAP_EVENT_SEQUENCE = 3;
const BACKGROUND_MESSAGE_KEYS = new Set([
  'target',
  'action',
  'data',
  // MessageHandler adds these transport-only fields before dispatch.
  'messageId',
  'context',
  'timestamp',
]);
const BOOTSTRAP_DATA_KEYS = new Set([
  'sessionId',
  'providerId',
  'tabId',
  'frameId',
  'documentId',
  'targetLanguage',
  'eventSequence',
]);
const TERMINAL_DATA_KEYS = new Set([
  'sessionId',
  'providerId',
  'tabId',
  'frameId',
  'documentId',
  'eventSequence',
  'event',
  'status',
  'error',
]);

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function hasScalarValues(record) {
  return Object.values(record).every(value => (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ));
}

function hasAllowedKeys(record, allowedKeys) {
  return Object.keys(record).every(key => allowedKeys.has(key));
}

function isSessionId(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.trim().length <= 256;
}

function isDocumentId(value) {
  return typeof value === 'string' && Boolean(value.trim()) && value.trim().length <= 256;
}

function isAddress(value) {
  return isPlainRecord(value)
    && isSessionId(value.sessionId)
    && isLiveDubbingProviderId(value.providerId)
    && Number.isInteger(value.tabId) && value.tabId >= 0
    && Number.isInteger(value.frameId) && value.frameId >= 0
    && isDocumentId(value.documentId);
}

function readAddress(descriptor) {
  if (!isAddress(descriptor)) return null;
  return {
    sessionId: descriptor.sessionId.trim(),
    providerId: descriptor.providerId,
    tabId: descriptor.tabId,
    frameId: descriptor.frameId,
    documentId: descriptor.documentId.trim(),
  };
}

function readRequestData(request) {
  const data = request?.data;
  if (!isPlainRecord(data)
    || request.action !== LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP
    || !isSessionId(data.sessionId)
    || !isLiveDubbingProviderId(data.providerId)
    || !Number.isInteger(data.eventSequence) || data.eventSequence < 0
    || typeof data.targetLanguage !== 'string') return null;
  return data;
}

function createBootstrapMessage(request, descriptor) {
  const address = readAddress(descriptor);
  const requestData = readRequestData(request);
  if (!address || !requestData || address.providerId !== 'gemini'
    || requestData.sessionId !== address.sessionId
    || requestData.providerId !== address.providerId
    || (requestData.eventSequence !== FIREFOX_CONNECT_REQUEST_EVENT_SEQUENCE
      && requestData.eventSequence !== FIREFOX_BOOTSTRAP_EVENT_SEQUENCE)) return null;

  let targetLanguage;
  try {
    targetLanguage = normalizeProviderTargetLanguage('gemini', descriptor.targetLanguage);
  } catch {
    return null;
  }
  let requestLanguage;
  try {
    requestLanguage = normalizeProviderTargetLanguage('gemini', requestData.targetLanguage);
  } catch {
    return null;
  }
  if (targetLanguage !== requestLanguage) return null;

  return {
    target: FIREFOX_CONTENT_BACKGROUND_TARGET,
    action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP,
    data: {
      ...address,
      targetLanguage,
      eventSequence: FIREFOX_BOOTSTRAP_EVENT_SEQUENCE,
    },
  };
}

function parseBootstrapResponse(response, descriptor) {
  const address = readAddress(descriptor);
  if (!address || !isPlainRecord(response)) return null;
  if (response.success !== true
    || response.providerId !== 'gemini'
    || Object.keys(response).some(key => !['success', 'providerId', 'targetLanguage', 'bootstrap'].includes(key))) {
    return null;
  }
  let targetLanguage;
  try {
    targetLanguage = normalizeProviderTargetLanguage('gemini', response.targetLanguage);
  } catch {
    return null;
  }
  if (targetLanguage !== normalizeProviderTargetLanguage('gemini', descriptor.targetLanguage)
    || !isPlainRecord(response.bootstrap)
    || Object.keys(response.bootstrap).length !== 1
    || typeof response.bootstrap.accessToken !== 'string'
    || !response.bootstrap.accessToken) return null;

  return {
    success: true,
    providerId: address.providerId,
    targetLanguage,
    bootstrap: { accessToken: response.bootstrap.accessToken },
  };
}

function createTerminalMessage(notification, descriptor) {
  const address = readAddress(descriptor);
  if (notification?.action !== LIVE_DUBBING_ACTIONS.TERMINAL) return null;
  const data = notification?.data;
  if (!address || address.providerId !== LIVE_DUBBING_PROVIDER_ID || !isPlainRecord(data)
    || !Number.isInteger(data.eventSequence) || data.eventSequence < 0
    || typeof data.event !== 'string' || !SAFE_EVENT.test(data.event)) return null;

  const status = Object.values(LIVE_DUBBING_STATUS).includes(data.status) ? data.status : null;
  const error = typeof data.error === 'string' && SAFE_ERROR.test(data.error) ? data.error : null;
  return {
    target: FIREFOX_CONTENT_BACKGROUND_TARGET,
    action: FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL,
    data: {
      ...address,
      eventSequence: data.eventSequence,
      event: data.event,
      ...(status ? { status } : {}),
      ...(error ? { error } : {}),
    },
  };
}

/**
 * Parse a dedicated Firefox content→Background route into a fresh scalar DTO.
 * MessageHandler transport metadata is tolerated, but route data stays closed
 * so credentials, provider bodies, and arbitrary diagnostics never reach the
 * coordinator.
 * @param {unknown} message
 * @returns {{target: string, action: string, data: object}|null}
 */
export function parseFirefoxContentBackgroundMessage(message) {
  if (!isPlainRecord(message)
    || message.target !== FIREFOX_CONTENT_BACKGROUND_TARGET
    || !Object.keys(message).every(key => BACKGROUND_MESSAGE_KEYS.has(key))
    || !isPlainRecord(message.data)
    || !hasScalarValues(message.data)) return null;

  const data = message.data;
  if (message.action === FIREFOX_CONTENT_BACKGROUND_ACTIONS.REQUEST_BOOTSTRAP) {
    if (!hasAllowedKeys(data, BOOTSTRAP_DATA_KEYS)
      || !isSessionId(data.sessionId)
      || data.providerId !== LIVE_DUBBING_PROVIDER_ID
      || !Number.isInteger(data.tabId) || data.tabId < 0
      || data.frameId !== 0
      || !isDocumentId(data.documentId)
      || !Number.isInteger(data.eventSequence)
      || data.eventSequence !== FIREFOX_BOOTSTRAP_EVENT_SEQUENCE
      || typeof data.targetLanguage !== 'string') return null;

    let targetLanguage;
    try {
      targetLanguage = normalizeProviderTargetLanguage(LIVE_DUBBING_PROVIDER_ID, data.targetLanguage);
    } catch {
      return null;
    }

    return {
      target: FIREFOX_CONTENT_BACKGROUND_TARGET,
      action: message.action,
      data: {
        sessionId: data.sessionId.trim(),
        providerId: LIVE_DUBBING_PROVIDER_ID,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId.trim(),
        targetLanguage,
        eventSequence: data.eventSequence,
      },
    };
  }

  if (message.action !== FIREFOX_CONTENT_BACKGROUND_ACTIONS.TERMINAL
    || !hasAllowedKeys(data, TERMINAL_DATA_KEYS)
    || !isSessionId(data.sessionId)
    || data.providerId !== LIVE_DUBBING_PROVIDER_ID
    || !Number.isInteger(data.tabId) || data.tabId < 0
    || data.frameId !== 0
    || !isDocumentId(data.documentId)
    || !Number.isInteger(data.eventSequence) || data.eventSequence < 0
    || typeof data.event !== 'string' || !SAFE_EVENT.test(data.event)) return null;

  if (data.status !== undefined
    && (typeof data.status !== 'string' || !Object.values(LIVE_DUBBING_STATUS).includes(data.status))) return null;
  if (data.error !== undefined
    && (typeof data.error !== 'string' || !SAFE_ERROR.test(data.error))) return null;

  return {
    target: FIREFOX_CONTENT_BACKGROUND_TARGET,
    action: message.action,
    data: {
      sessionId: data.sessionId.trim(),
      providerId: LIVE_DUBBING_PROVIDER_ID,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId.trim(),
      eventSequence: data.eventSequence,
      event: data.event,
      ...(data.status === undefined ? {} : { status: data.status }),
      ...(data.error === undefined ? {} : { error: data.error }),
    },
  };
}

/**
 * Create the only Firefox-specific seam injected into the browser-neutral
 * Controller. Missing transport and malformed responses fail closed.
 */
export function createFirefoxContentRuntimeMessenger(options = {}) {
  const runtime = options.browserAPI?.runtime || options.runtime || null;
  const sendMessage = runtime?.sendMessage;

  return {
    async requestBootstrap(request, descriptor) {
      let message;
      try {
        message = createBootstrapMessage(request, descriptor);
      } catch {
        message = null;
      }
      if (typeof sendMessage !== 'function' || !message) {
        return { success: false, error: BOOTSTRAP_FAILURE };
      }
      try {
        return parseBootstrapResponse(await sendMessage.call(runtime, message), descriptor)
          || { success: false, error: BOOTSTRAP_FAILURE };
      } catch {
        return { success: false, error: BOOTSTRAP_FAILURE };
      }
    },

    notifyTerminal(notification, descriptor) {
      let message;
      try {
        message = createTerminalMessage(notification, descriptor);
      } catch {
        message = null;
      }
      if (typeof sendMessage !== 'function' || !message) return Promise.resolve(false);
      try {
        return Promise.resolve(sendMessage.call(runtime, message)).then(() => true, () => false);
      } catch {
        return Promise.resolve(false);
      }
    },
  };
}

export { createBootstrapMessage as createFirefoxContentBootstrapMessage };
export { createTerminalMessage as createFirefoxContentTerminalMessage };
