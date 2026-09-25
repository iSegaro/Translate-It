import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';
import { normalizeSpikeTargetLanguage } from './spikeTargetLanguage.js';
import {
  createSpikeDevStart,
  createSpikeDevStatus,
  createSpikeDevStop,
  parseSpikeDevAck,
  parseSpikeDevStatusAck,
} from './spikeDevContract.js';
import { OpenAIRealtimeBootstrapService } from './OpenAIRealtimeBootstrapService.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'OpenAISpikeDevBackgroundHook(SPIKE)');

/** Dev-only lease owner. Never reuse a production owner. */
export const OPENAI_SPIKE_DEV_OWNER = 'openai-spike-dev';
/** Capture transaction reasons for the dev lease. */
export const OPENAI_SPIKE_DEV_LEASE_REASONS = Object.freeze(['USER_MEDIA', 'AUDIO_PLAYBACK', 'WEB_RTC']);

const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,39}$/;
const DEFAULT_ACK_TIMEOUT_MS = 30_000;
const DEFAULT_STATUS_TIMEOUT_MS = 5_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;

function toSafeCode(value, fallback) {
  return typeof value === 'string' && SAFE_CODE_PATTERN.test(value) ? value : fallback;
}

function defaultUuid() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  } catch { /* fall through to the local fallback */ }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  return hex.join('');
}

/**
 * Background tester hook for the Phase D OpenAI spike (SPIKE ONLY).
 * Exposed as `globalThis.__translateItOpenAIRealtimeSpike` from DEV-gated
 * Background entry code, so a fresh load works without a pre-existing
 * Offscreen document.
 *
 * Ownership: Background owns tab/lease/key/mint/stream-id/lifecycle; the
 * Offscreen dev listener owns consume/tracks/transport/playback/cleanup.
 * Start ordering is deliberate: validate target → active tab → dev lease
 * (creates the Offscreen document when absent) → mint → recheck
 * transaction → `getMediaStreamId` LAST → immediately dispatch START.
 * Nothing slow runs between the stream-id mint and the dispatch, because
 * tab stream ids must be consumed promptly. Offscreen consumes with
 * getUserMedia first, then runs the transport.
 *
 * Every message carries the transaction identity; stale or foreign acks
 * can never affect a run. A malformed or missing Offscreen ack still
 * releases the Background-owned lease — release never depends on the
 * Offscreen echoing lease identity (it is tracked locally per attempt).
 *
 * Nothing sensitive is logged: no key, secret, SDP, transcript, stream
 * id, or raw body ever reaches a log, error, or status payload — scalar
 * codes and scalar status only.
 */
export class OpenAISpikeDevBackgroundHook {
  constructor(options = {}) {
    this.chromeAPI = options.chromeAPI || globalThis.chrome || null;
    this.browserAPI = options.browserAPI || this.chromeAPI;
    this.leaseManager = options.leaseManager || offscreenRuntimeLeaseManager;
    this.mintService = options.mintService || new OpenAIRealtimeBootstrapService({
      fetchImpl: options.fetchImpl,
      getKeysImpl: options.getKeysImpl,
      logger: options.logger,
    });
    this.sendMessage = typeof options.sendMessage === 'function'
      ? options.sendMessage
      : (message) => this.chromeAPI?.runtime?.sendMessage?.(message);
    this.uuid = typeof options.uuid === 'function' ? options.uuid : defaultUuid;
    this.ackTimeoutMs = Number.isSafeInteger(options.ackTimeoutMs) && options.ackTimeoutMs > 0
      ? options.ackTimeoutMs
      : DEFAULT_ACK_TIMEOUT_MS;
    this.statusTimeoutMs = Number.isSafeInteger(options.statusTimeoutMs) && options.statusTimeoutMs > 0
      ? options.statusTimeoutMs
      : DEFAULT_STATUS_TIMEOUT_MS;
    this.stopTimeoutMs = Number.isSafeInteger(options.stopTimeoutMs) && options.stopTimeoutMs > 0
      ? options.stopTimeoutMs
      : DEFAULT_STOP_TIMEOUT_MS;
    this.log = options.logger || logger;

    this.session = null;
    this.pending = null;
  }

  get active() {
    return Boolean(this.session);
  }

  /**
   * Run the full validation flow for one target language. Resolves success
   * only after the Offscreen ack confirms a running session.
   * @param {{targetLanguage: unknown}} input
   * @returns {Promise<{success: boolean, targetLanguage?: string, error?: string}>}
   */
  async start(input = {}) {
    if (this.pending || this.session) {
      return { success: false, error: 'ALREADY_STARTED' };
    }

    const targetLanguage = normalizeSpikeTargetLanguage(input.targetLanguage);
    if (!targetLanguage) return { success: false, error: 'INVALID_TARGET_LANGUAGE' };

    const attempt = {
      transactionId: this.uuid(),
      targetLanguage,
      leaseId: null,
      leaseHeld: false,
      leaseReleased: false,
      dispatched: false,
      stopSent: false,
      done: false,
    };
    this.pending = attempt;
    const isCurrent = () => this.pending === attempt && !attempt.done;

    const tabId = await this._resolveActiveTabId();
    if (!isCurrent()) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'START_CANCELLED' };
    }
    if (tabId === null) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'TARGET_TAB_UNAVAILABLE' };
    }

    // The dev lease creates the Offscreen document when absent, so it comes
    // before any Offscreen dispatch. The id is fixed upfront so every
    // abandon path can release it.
    const leaseId = attempt.transactionId;
    attempt.leaseId = leaseId;
    let leaseAcquired = false;
    try {
      leaseAcquired = await this.leaseManager.acquire({
        owner: OPENAI_SPIKE_DEV_OWNER,
        leaseId,
        requiredReasons: [...OPENAI_SPIKE_DEV_LEASE_REASONS],
      }) === true;
    } catch {
      leaseAcquired = false;
    }
    if (!isCurrent()) {
      if (leaseAcquired && !attempt.leaseReleased) {
        // stop() already ran its teardown before this outcome was known,
        // so it could not release. Mark held and release exactly once here.
        attempt.leaseHeld = true;
        await this._releaseLeaseOnce(attempt);
      }
      await this._teardownAttempt(attempt);
      return { success: false, error: 'START_CANCELLED' };
    }
    if (!leaseAcquired) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'LEASE_UNAVAILABLE' };
    }
    attempt.leaseHeld = true;

    // Mint before the stream id: minting is slow, stream ids are perishable.
    let bootstrap = null;
    try {
      bootstrap = await this.mintService.mintClientSecret(targetLanguage);
    } catch {
      bootstrap = null;
    }
    if (!isCurrent()) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'START_CANCELLED' };
    }
    if (!bootstrap) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'BOOTSTRAP_UNAVAILABLE' };
    }

    // Recheck done above. The stream id goes last and is dispatched
    // immediately — no awaits may run between the two.
    const streamId = await this._getMediaStreamId(tabId);
    if (!isCurrent()) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'START_CANCELLED' };
    }
    if (!streamId) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'CAPTURE_FAILED' };
    }

    attempt.dispatched = true;
    const ack = await this._dispatchStart(attempt, streamId, bootstrap);
    const parsed = parseSpikeDevAck(ack, attempt.transactionId);
    if (!isCurrent()) {
      await this._teardownAttempt(attempt);
      return { success: false, error: 'START_CANCELLED' };
    }
    if (!parsed || parsed.success !== true) {
      const error = toSafeCode(parsed?.error, 'OFFSCREEN_START_FAILED');
      await this._teardownAttempt(attempt);
      this.log.debug('[OpenAISpikeDevBackgroundHook] Offscreen start failed', { error });
      return { success: false, error };
    }

    this.session = attempt;
    this.pending = null;
    this.log.debug('[OpenAISpikeDevBackgroundHook] Validation session started');
    return { success: true, targetLanguage: parsed.targetLanguage || targetLanguage };
  }

  /** Scalar-only status; Offscreen telemetry is merged best-effort. */
  async status() {
    const session = this.session;
    const base = {
      success: true,
      active: Boolean(session),
      starting: Boolean(this.pending),
      targetLanguage: session?.targetLanguage || this.pending?.targetLanguage || null,
    };
    if (!session) {
      return { ...base, captureReady: false, telemetry: null };
    }
    let ack = null;
    try {
      const sent = this.sendMessage(createSpikeDevStatus(session.transactionId));
      ack = await this._awaitSettled(sent, this.statusTimeoutMs);
    } catch {
      ack = null;
    }
    if (this.session !== session) {
      return { success: true, active: false, starting: Boolean(this.pending), targetLanguage: null, captureReady: false, telemetry: null };
    }
    const parsed = parseSpikeDevStatusAck(ack, session.transactionId);
    if (!parsed) {
      return { ...base, captureReady: false, telemetry: null };
    }
    return { ...base, captureReady: parsed.captureReady, telemetry: parsed.telemetry };
  }

  /**
   * Idempotent teardown: Offscreen cleanup first, then the
   * Background-owned lease release. The lease id is tracked locally —
   * never taken from an Offscreen echo.
   */
  async stop() {
    const holders = [];
    if (this.pending) {
      holders.push(this.pending);
      this.pending = null;
    }
    if (this.session) {
      holders.push(this.session);
      this.session = null;
    }
    if (holders.length === 0) return { success: true, idempotent: true };
    for (const holder of new Set(holders)) {
      await this._teardownAttempt(holder);
    }
    this.log.debug('[OpenAISpikeDevBackgroundHook] Validation session stopped');
    return { success: true };
  }

  async _dispatchStart(attempt, streamId, bootstrap) {
    let sent = null;
    try {
      sent = this.sendMessage(createSpikeDevStart({
        transactionId: attempt.transactionId,
        targetLanguage: attempt.targetLanguage,
        streamId,
        bootstrap: {
          secret: bootstrap.secret,
          targetLanguage: bootstrap.targetLanguage,
          model: bootstrap.model,
          expiresAt: bootstrap.expiresAt ?? null,
        },
      }));
    } catch {
      sent = null;
    }
    return this._awaitSettled(sent, this.ackTimeoutMs);
  }

  async _teardownAttempt(attempt) {
    if (this.pending === attempt) this.pending = null;
    if (this.session === attempt) this.session = null;
    if (attempt.done) return;
    attempt.done = true;
    if (attempt.dispatched && !attempt.stopSent) {
      attempt.stopSent = true;
      let sent = null;
      try {
        sent = this.sendMessage(createSpikeDevStop(attempt.transactionId));
      } catch {
        sent = null;
      }
      await this._awaitSettled(sent, this.stopTimeoutMs);
    }
    await this._releaseLeaseOnce(attempt);
  }

  async _releaseLeaseOnce(attempt) {
    const leaseId = attempt.leaseId;
    if (!leaseId || !attempt.leaseHeld || attempt.leaseReleased) return false;
    attempt.leaseReleased = true;
    try {
      return await this.leaseManager.release({ owner: OPENAI_SPIKE_DEV_OWNER, leaseId }) === true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve the user-visible active tab id. `tabs.query` with
   * `currentWindow`/`lastFocusedWindow` reports no tabs from SW DevTools
   * (the browser window reads `focused: false` there), so the last-focused
   * normal window is inspected directly and its active tab is taken. Fails
   * closed to null — never an audible or arbitrary tab.
   */
  async _resolveActiveTabId() {
    try {
      const window = await this.browserAPI?.windows?.getLastFocused?.({
        populate: true,
        windowTypes: ['normal'],
      });
      const tabs = Array.isArray(window?.tabs) ? window.tabs : [];
      const tab = tabs.find((candidate) => candidate?.active === true) || null;
      return tab && Number.isInteger(tab.id) && tab.id >= 0 ? tab.id : null;
    } catch {
      return null;
    }
  }

  async _getMediaStreamId(tabId) {
    const getMediaStreamId = this.chromeAPI?.tabCapture?.getMediaStreamId;
    if (typeof getMediaStreamId !== 'function') return null;
    try {
      const streamId = await getMediaStreamId.call(this.chromeAPI.tabCapture, { targetTabId: tabId });
      return typeof streamId === 'string' && streamId ? streamId : null;
    } catch {
      return null;
    }
  }

  /**
   * Settle a dev-message round trip without ever rejecting and without
   * unhandled rejections. Timeout and transport failures resolve to null.
   */
  async _awaitSettled(responsePromise, timeoutMs) {
    let timer = null;
    try {
      const settled = Promise.resolve().then(() => responsePromise).then(
        (value) => ({ ok: true, value }),
        () => ({ ok: false }),
      );
      const winner = await Promise.race([
        settled,
        new Promise((resolve) => {
          timer = setTimeout(() => resolve(null), timeoutMs);
        }),
      ]);
      return winner && winner.ok === true ? winner.value : null;
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }
  }
}

/**
 * Install the tester hook (`globalThis.__translateItOpenAIRealtimeSpike`)
 * with `{ start, stop, status }` in a Background context. Dev-only: call
 * only from DEV-gated entry code, never from production wiring.
 * @param {object} [options] Hook dependencies (see constructor).
 * @returns {OpenAISpikeDevBackgroundHook}
 */
export function installOpenAISpikeDevBackgroundHook(options = {}) {
  const hook = new OpenAISpikeDevBackgroundHook(options);
  try {
    globalThis.__translateItOpenAIRealtimeSpike = hook;
  } catch { /* hook installation is best effort */ }
  return hook;
}
