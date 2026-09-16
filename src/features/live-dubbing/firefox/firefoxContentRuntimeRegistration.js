/**
 * Background registration and bounded discovery for Firefox content runtime.
 *
 * Readiness is accepted only from the native top-frame sender. Discovery is a
 * one-shot nonce challenge targeted to a known tab/frame; its response is a
 * separate runtime message so a tabs.sendMessage return value can never spoof
 * identity. This module stores no URL, media, provider, or credential data.
 */

import { LIVE_DUBBING_STATUS_TIMEOUT } from '../constants.js';
import {
  createFirefoxContentRuntimeDiscoveryMessage,
  FIREFOX_CONTENT_RUNTIME_ACTIONS,
  parseFirefoxContentRuntimeMessage,
} from './firefoxContentRuntimeContract.js';
import {
  FirefoxContentRuntimeRegistry,
  getTrustedFirefoxContentRuntimeIdentity,
} from './FirefoxContentRuntimeRegistry.js';

export const FIREFOX_CONTENT_RUNTIME_DISCOVERY_TIMEOUT_MS = LIVE_DUBBING_STATUS_TIMEOUT;
export const FIREFOX_CONTENT_RUNTIME_DISCOVERY_TIMEOUT = FIREFOX_CONTENT_RUNTIME_DISCOVERY_TIMEOUT_MS;

function targetKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function validTarget(tabId, frameId) {
  return Number.isInteger(tabId) && tabId >= 0 && frameId === 0;
}

function createRandomNonce() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      globalThis.crypto.getRandomValues(values);
      return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
    }
  } catch {
    // Fall through to the non-throwing local fallback.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function resolveNonce(factory) {
  try {
    const nonce = factory();
    return typeof nonce === 'string' && nonce.trim() ? nonce.trim() : createRandomNonce();
  } catch {
    return createRandomNonce();
  }
}

export class FirefoxContentRuntimeRegistration {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || null;
    this.registry = options.registry || new FirefoxContentRuntimeRegistry({
      browserAPI: this.browserAPI,
    });
    this.discoveryTimeoutMs = Number.isFinite(options.discoveryTimeoutMs)
      && options.discoveryTimeoutMs >= 0
      ? options.discoveryTimeoutMs
      : FIREFOX_CONTENT_RUNTIME_DISCOVERY_TIMEOUT_MS;
    this.nonceFactory = options.nonceFactory || createRandomNonce;
    this.pendingByNonce = new Map();
    this.pendingByTarget = new Map();
    this.listener = this._handleMessage.bind(this);
    this.installed = false;
  }

  install() {
    if (this.installed) return this;
    const runtime = this.browserAPI?.runtime;
    if (!runtime?.onMessage?.addListener) return this;
    runtime.onMessage.addListener(this.listener);
    this.installed = true;
    return this;
  }

  /**
   * Handle a readiness message. A nonce-bearing ready is never accepted as a
   * normal registration: it must match the currently active target challenge.
   */
  _handleMessage(message, sender) {
    const parsed = parseFirefoxContentRuntimeMessage(message);
    if (!parsed || parsed.action !== FIREFOX_CONTENT_RUNTIME_ACTIONS.READY) return undefined;

    const identity = getTrustedFirefoxContentRuntimeIdentity(sender, this.browserAPI);
    if (!identity) return undefined;

    if (parsed.nonce === null) {
      this.registry.register(sender);
      return undefined;
    }

    const challenge = this.pendingByNonce.get(parsed.nonce);
    if (!challenge
      || this.pendingByTarget.get(challenge.key) !== challenge
      || challenge.tabId !== identity.tabId
      || challenge.frameId !== identity.frameId) {
      return undefined;
    }

    this._settleChallenge(challenge, this.registry.register(sender));
    return undefined;
  }

  /**
   * Ask a known frame to re-register after a worker restart or an empty
   * registry. The promise resolves to native identity or null on timeout,
   * transport failure, stale challenge, or invalid sender.
   * @param {number} tabId known tab id
   * @param {number} frameId currently supported frame id (0)
   * @param {{timeoutMs?: number}} options
   * @returns {Promise<object|null>}
   */
  discover(tabId, frameId = 0, options = {}) {
    if (!validTarget(tabId, frameId)) return Promise.resolve(null);
    const sendMessage = this.browserAPI?.tabs?.sendMessage;
    if (typeof sendMessage !== 'function') return Promise.resolve(null);

    const key = targetKey(tabId, frameId);
    const previous = this.pendingByTarget.get(key);
    if (previous) this._settleChallenge(previous, null);

    const nonce = resolveNonce(this.nonceFactory);
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs >= 0
      ? options.timeoutMs
      : this.discoveryTimeoutMs;
    const challenge = {
      key,
      tabId,
      frameId,
      nonce,
      timer: null,
      resolve: null,
    };
    const result = new Promise(resolve => {
      challenge.resolve = resolve;
    });
    this.pendingByNonce.set(nonce, challenge);
    this.pendingByTarget.set(key, challenge);
    challenge.timer = setTimeout(() => this._settleChallenge(challenge, null), timeoutMs);

    try {
      Promise.resolve(sendMessage.call(
        this.browserAPI.tabs,
        tabId,
        createFirefoxContentRuntimeDiscoveryMessage(nonce),
        { frameId },
      )).catch(() => this._settleChallenge(challenge, null));
    } catch {
      this._settleChallenge(challenge, null);
    }

    return result;
  }

  _settleChallenge(challenge, identity) {
    if (!challenge || this.pendingByNonce.get(challenge.nonce) !== challenge) return;
    this.pendingByNonce.delete(challenge.nonce);
    if (this.pendingByTarget.get(challenge.key) === challenge) {
      this.pendingByTarget.delete(challenge.key);
    }
    clearTimeout(challenge.timer);
    challenge.resolve(identity ? { ...identity } : null);
  }

  get(tabId, frameId = 0) {
    return this.registry.get(tabId, frameId);
  }

  dispose() {
    if (this.installed) {
      try {
        this.browserAPI.runtime.onMessage.removeListener?.(this.listener);
      } catch { /* best effort */ }
    }
    this.installed = false;
    for (const challenge of this.pendingByNonce.values()) this._settleChallenge(challenge, null);
    this.pendingByNonce.clear();
    this.pendingByTarget.clear();
    this.registry.clear();
  }
}

/**
 * Install the Firefox-only Background listener. The returned registration is
 * intentionally in-memory and disposable; a restarted worker gets an empty
 * registry and can call discover() again.
 */
export function installFirefoxContentRuntimeRegistration(options = {}) {
  const registration = new FirefoxContentRuntimeRegistration(options);
  return registration.install();
}

export const discoverFirefoxContentRuntime = (registration, tabId, frameId = 0, options = {}) => (
  registration?.discover?.(tabId, frameId, options) || Promise.resolve(null)
);
