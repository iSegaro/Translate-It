/**
 * Firefox Live Dubbing content-runtime host (production, Phase 4 control).
 *
 * Per-document control host owned by the content compartment. It accepts
 * only the closed scalar PREPARE/STATUS/CONNECT_PROVIDER/DISPOSE vocabulary
 * with exact
 * session/provider/tab/frame/document/event identity and performs no
 * capture, provider execution, site handling, media transport, or page-world
 * exposure. This instance is deliberately independent of the production
 * offscreen control owner: control-fencing state lives here, per document,
 * and navigation invalidates it.
 *
 * Feature lifecycle is never owned here: PREPARE activates the lazy
 * `liveDubbing` feature through the injected `featureLifecycle` seam and the
 * session is marked PREPARED only on confirmed activation and local runtime
 * preparation (fail closed, no partial PREPARED). CONNECT_PROVIDER is allowed
 * only for that prepared liveDubbing runtime and reports confirmed provider
 * setup. The local sequence remains 0 → 1 → 2 → 3; the host never advances it
 * from an inexact Controller result. DISPOSE deactivates exactly once, then
 * disposes host state. STATUS is lightweight and never activates.
 */

import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_STOP_TIMEOUT,
} from '../constants.js';
import {
  normalizeProviderTargetLanguage,
} from '../contracts.js';
import {
  LIVE_DUBBING_FEATURE_NAME,
} from '../handlers/LiveDubbingFeatureHandler.js';
import {
  FIREFOX_CONTENT_ACKS,
  FIREFOX_CONTENT_STATUS,
  isAuthorizedFirefoxContentControlSender,
  parseFirefoxContentMessage,
  sanitizeFirefoxContentResponse,
} from './firefoxContentContract.js';

const TERMINAL_STATUS = FIREFOX_CONTENT_STATUS.IDLE;
const PREPARED_STATUS = FIREFOX_CONTENT_STATUS.PREPARING_CAPTURE;

function readBestEffortSessionId(message) {
  const sessionId = message?.data?.sessionId ?? message?.sessionId;
  return typeof sessionId === 'string' && sessionId.trim() ? sessionId : null;
}

function readBestEffortProviderId(message) {
  const providerId = message?.data?.providerId ?? message?.providerId;
  return typeof providerId === 'string' ? providerId : null;
}

function isSameDocument(identity, data) {
  return Boolean(identity
    && data
    && identity.frameId === data.frameId
    && typeof identity.documentId === 'string'
    && typeof data.documentId === 'string'
    && identity.documentId.trim() === data.documentId.trim()
    && (identity.tabId === undefined || identity.tabId === data.tabId));
}

/**
 * Owns one document's Live Dubbing control session.
 * The document binding is learned from the first valid PREPARE and every
 * later message must match it; a document mismatch fails closed so a stale
 * document can never observe or disturb another document's session.
 * Feature activation is delegated to the injected `featureLifecycle` seam
 * (`{ requestActivation, deactivateFeature, prepareRuntime,
 * isFeatureActive? }`); without it, PREPARE fails closed while
 * STATUS/DISPOSE stay safe and terminal.
 */
export class FirefoxLiveDubbingContentHost {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || null;
    this.featureLifecycle = options.featureLifecycle || null;
    this.session = null;
    this.pendingPreparation = null;
    this.documentIdentity = null;
    this.disposedSession = null;
    // Retained single-flight teardown barrier: null, or
    // `{ promise, cleaned, retry }` where `cleaned` is null while in flight
    // and the confirmed boolean afterwards. A failed (`false`) record
    // persists so fresh adoption stays barred; only a confirmed-clean retry
    // success releases it back to null. Fresh adoption waits bounded instead
    // of overlapping the managed feature.
    this.teardown = null;
    // Bound for the barrier wait. Production reuses the bounded-cleanup
    // constant; tests may inject a smaller bound. Never an arbitrary delay:
    // expiry fails fresh adoption closed with nothing adopted.
    this.teardownTimeoutMs = Number.isFinite(options.teardownTimeoutMs) && options.teardownTimeoutMs >= 0
      ? options.teardownTimeoutMs
      : LIVE_DUBBING_STOP_TIMEOUT;
  }

  /**
   * Whether an action belongs to this host. Closed vocabulary only.
   * @param {unknown} action
   * @returns {boolean}
   */
  handles(action) {
    return action === LIVE_DUBBING_ACTIONS.PREPARE
      || action === LIVE_DUBBING_ACTIONS.STATUS
      || action === LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER
      || action === LIVE_DUBBING_ACTIONS.DISPOSE;
  }

  /**
   * Handle one Background control message. Always resolves a fresh
   * scalar-only response; never throws and never exposes media, payloads,
   * or exception objects. PREPARE resolves only after lazy feature activation
   * and local source adoption settle; STATUS never activates.
   * @param {object} message closed control message
   * @param {object|null} sender Background sender metadata
   * @returns {Promise<object>} sanitized scalar response
   */
  async handle(message = {}, sender = null) {
    if (!isAuthorizedFirefoxContentControlSender(sender, this.browserAPI)) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_UNAUTHORIZED',
        ignored: true,
        sessionId: readBestEffortSessionId(message),
        providerId: readBestEffortProviderId(message),
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    const parsed = parseFirefoxContentMessage(message);
    if (!parsed) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
        ignored: true,
        sessionId: readBestEffortSessionId(message),
        providerId: readBestEffortProviderId(message),
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    const documentBinding = this.documentIdentity || this.pendingPreparation?.data;
    if (documentBinding && !isSameDocument(documentBinding, parsed.data)) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_STALE_DOCUMENT',
        ignored: true,
        sessionId: parsed.data.sessionId,
        providerId: parsed.data.providerId,
        tabId: parsed.data.tabId,
        frameId: parsed.data.frameId,
        documentId: parsed.data.documentId,
        eventSequence: parsed.data.eventSequence,
        status: this.session?.status || TERMINAL_STATUS,
      });
    }

    switch (parsed.action) {
      case LIVE_DUBBING_ACTIONS.PREPARE:
        return this._prepare(parsed.data);
      case LIVE_DUBBING_ACTIONS.STATUS:
        return this._status(parsed.data);
      case LIVE_DUBBING_ACTIONS.CONNECT_PROVIDER:
        return this._connect(parsed.data);
      case LIVE_DUBBING_ACTIONS.DISPOSE:
        return this._dispose(parsed.data);
      default:
        return this._respond({
          success: false,
          error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
          ignored: true,
          sessionId: parsed.data.sessionId,
          providerId: parsed.data.providerId,
          status: this.session?.status || TERMINAL_STATUS,
        });
    }
  }

  /**
   * Invalidate the document binding (navigation). The active session, when
   * any, is terminalized into the tombstone so its identity cannot resurrect
   * on this document; a fresh session id may still prepare afterwards.
   * Invalidation also starts and retains the single-flight teardown barrier
   * for the fenced session and returns immediately: fencing is synchronous
   * so the old session is terminal even while teardown settles, a failed
   * teardown cannot reopen it, and a later explicit DISPOSE reuses the same
   * cleanup through the tombstone. Fresh adoption waits on the retained
   * barrier (bounded, fail-closed) instead of overlapping the teardown.
   * With no session or pending preparation there is nothing to tear down,
   * which keeps repeated invalidation idempotent.
   * @param {string|null} reason scalar reason, unused beyond logging fences
   */
  invalidate(reason = null) {
    void reason;
    const session = this.session;
    const pending = this.pendingPreparation;
    if (!session && !pending) return;
    if (!session && pending) {
      pending.cancelled = true;
      this.pendingPreparation = null;
      this.disposedSession = {
        sessionId: pending.data.sessionId,
        providerId: pending.data.providerId,
      };
      void this._deactivateFeatureOnce();
      return;
    }
    this.disposedSession = {
      sessionId: session.sessionId,
      providerId: session.providerId,
    };
    this.session = null;
    void this._deactivateFeatureOnce();
  }

  async _prepare(data) {
    // Already-terminal identity fails fast without waiting on teardown.
    if (this._isTombstoned(data)) return this._disposedFailure(data);
    // Single-flight teardown barrier: a fresh adoption never overlaps an
    // in-flight teardown, and a failed teardown stays barred with a
    // controlled single-flight retry. Bounded so a hung teardown fails
    // closed (nothing adopted, retry stays safe) instead of permitting
    // overlap. Only confirmed-clean releases the barrier.
    if (!await this._adoptionMayProceed()) {
      return this._activationBlocked(data, data.eventSequence, this.session?.status || TERMINAL_STATUS);
    }
    // Re-fence after the wait: a concurrent terminal path may have landed
    // while this adoption waited.
    if (this._isTombstoned(data)) return this._disposedFailure(data);

    const pendingPreparation = this.pendingPreparation;
    if (pendingPreparation) {
      if (pendingPreparation.data.sessionId !== data.sessionId) return this._sessionBusy(data);
      if (pendingPreparation.data.providerId !== data.providerId
        || pendingPreparation.data.tabId !== data.tabId) {
        return this._sessionMismatch(data);
      }
      if (pendingPreparation.data.eventSequence !== data.eventSequence) {
        return this._sequenceMismatch(data);
      }
      if (data.targetLanguage !== undefined && data.targetLanguage !== null) {
        try {
          if (normalizeProviderTargetLanguage(data.providerId, data.targetLanguage)
            !== pendingPreparation.data.targetLanguage) {
            return this._respond({
              success: false,
              error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
              ignored: true,
              sessionId: data.sessionId,
              providerId: data.providerId,
              tabId: data.tabId,
              frameId: data.frameId,
              documentId: data.documentId,
              eventSequence: pendingPreparation.data.eventSequence,
              status: TERMINAL_STATUS,
            });
          }
        } catch {
          return this._activationBlocked(data, pendingPreparation.data.eventSequence, TERMINAL_STATUS);
        }
      }
      return pendingPreparation.promise
        || this._activationBlocked(data, data.eventSequence, TERMINAL_STATUS);
    }

    const session = this.session;
    if (session) {
      if (session.sessionId !== data.sessionId) {
        return this._sessionBusy(data);
      }
      if (session.providerId !== data.providerId || session.tabId !== data.tabId) {
        return this._sessionMismatch(data);
      }
      if (session.eventSequence !== data.eventSequence) {
        return this._sequenceMismatch(data);
      }
      let normalizedLanguage = null;
      try {
        normalizedLanguage = data.targetLanguage === undefined || data.targetLanguage === null
          ? session.targetLanguage
          : normalizeProviderTargetLanguage(data.providerId, data.targetLanguage);
      } catch {
        return this._respond({
          success: false,
          error: 'INVALID_TARGET_LANGUAGE',
          ignored: true,
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          eventSequence: session.eventSequence,
          status: session.status,
        });
      }
      if (normalizedLanguage !== session.targetLanguage) {
        return this._respond({
          success: false,
          error: 'LIVE_DUBBING_TARGET_LANGUAGE_MISMATCH',
          ignored: true,
          sessionId: data.sessionId,
          providerId: data.providerId,
          tabId: data.tabId,
          frameId: data.frameId,
          documentId: data.documentId,
          eventSequence: session.eventSequence,
          status: session.status,
        });
      }
      // Every PREPARE — first or retry — re-validates through feature
      // activation and local runtime preparation. A refused step fails closed
      // without disturbing the existing control session; explicit DISPOSE is
      // the teardown path.
      if (!await this._requestFeatureActivation()) {
        return this._activationBlocked(data, session.eventSequence, session.status);
      }
      if (!await this._prepareFeatureRuntime({ ...data, targetLanguage: session.targetLanguage })) {
        return this._activationBlocked(data, session.eventSequence, session.status);
      }
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.READY,
        sessionId: session.sessionId,
        providerId: session.providerId,
        tabId: session.tabId,
        frameId: session.frameId,
        documentId: session.documentId,
        targetLanguage: session.targetLanguage,
        eventSequence: session.eventSequence,
        runtimeEventSequence: session.runtimeEventSequence,
        active: true,
        prepared: true,
        idempotent: true,
        status: session.status,
      });
    }

    if (data.eventSequence !== 0) {
      return this._sequenceMismatch(data);
    }

    let targetLanguage;
    try {
      targetLanguage = normalizeProviderTargetLanguage(data.providerId, data.targetLanguage);
    } catch {
      return this._respond({
        success: false,
        error: 'INVALID_TARGET_LANGUAGE',
        ignored: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        status: TERMINAL_STATUS,
      });
    }

    const pending = {
      data: { ...data, targetLanguage },
      cancelled: false,
      promise: null,
    };
    this.pendingPreparation = pending;
    const preparation = this._prepareNewSession(pending);
    pending.promise = preparation;
    try {
      return await preparation;
    } finally {
      if (this.pendingPreparation === pending) this.pendingPreparation = null;
    }
  }

  async _prepareNewSession(pending) {
    const { data } = pending;
    const activated = await this._requestFeatureActivation();
    if (!activated) {
      return pending.cancelled || this._isTombstoned(data)
        ? this._disposedFailure(data)
        : this._activationBlocked(data, data.eventSequence, TERMINAL_STATUS);
    }
    if (pending.cancelled || this.pendingPreparation !== pending || this._isTombstoned(data)) {
      return this._disposedFailure(data);
    }
    if (!await this._prepareFeatureRuntime(data)) {
      return pending.cancelled || this._isTombstoned(data)
        ? this._disposedFailure(data)
        : this._activationBlocked(data, data.eventSequence, TERMINAL_STATUS);
    }
    if (pending.cancelled || this.pendingPreparation !== pending || this._isTombstoned(data)) {
      return this._disposedFailure(data);
    }

    this.session = {
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      targetLanguage: data.targetLanguage,
      eventSequence: data.eventSequence,
      runtimeEventSequence: this._readRuntimeEventSequence(data.eventSequence),
      status: PREPARED_STATUS,
    };
    this.documentIdentity = {
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
    };

    return this._respond({
      success: true,
      ack: FIREFOX_CONTENT_ACKS.READY,
      sessionId: this.session.sessionId,
      providerId: this.session.providerId,
      tabId: this.session.tabId,
      frameId: this.session.frameId,
      documentId: this.session.documentId,
      targetLanguage: this.session.targetLanguage,
      eventSequence: this.session.eventSequence,
      runtimeEventSequence: this.session.runtimeEventSequence,
      active: true,
      prepared: true,
      status: this.session.status,
    });
  }

  async _connect(data) {
    const session = this.session;
    if (!session || !this._isLiveDubbingActive()) {
      return this._runtimeNotPrepared(data);
    }
    if (data.providerId !== LIVE_DUBBING_PROVIDER_ID) {
      return this._respond({
        success: false,
        error: 'LIVE_DUBBING_PROVIDER_UNSUPPORTED',
        ignored: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        runtimeEventSequence: session.runtimeEventSequence,
        status: session.status,
      });
    }
    if (session.sessionId !== data.sessionId
      || session.providerId !== data.providerId
      || session.tabId !== data.tabId
      || session.frameId !== data.frameId
      || session.documentId !== data.documentId) {
      return this._sessionMismatch(data);
    }

    if (session.connectResult && session.connectRequestEventSequence === data.eventSequence) {
      return this._respond({ ...session.connectResult, idempotent: true });
    }
    if (session.connectResult) {
      return this._runtimeSequenceMismatch(data, session);
    }
    if (session.connectPromise) {
      if (session.connectRequestEventSequence !== data.eventSequence) {
        return this._runtimeSequenceMismatch(data, session);
      }
      return session.connectPromise;
    }
    if (data.eventSequence !== session.runtimeEventSequence + 1) {
      return this._runtimeSequenceMismatch(data, session);
    }

    const descriptor = {
      ...data,
      targetLanguage: session.targetLanguage,
      runtimeEventSequence: session.runtimeEventSequence,
    };
    session.connectRequestEventSequence = data.eventSequence;
    session.connectPromise = Promise.resolve()
      .then(() => this._connectFeatureRuntime(descriptor))
      .then(result => {
        if (this.session !== session || session.connectInvalidated || this._isTombstoned(data)) {
          return this._disposedFailure(data);
        }
        if (!result || result.success !== true) {
          return this._respond({
            success: false,
            error: result?.error || 'LIVE_DUBBING_PROVIDER_ERROR',
            ignored: true,
            sessionId: data.sessionId,
            providerId: data.providerId,
            tabId: data.tabId,
            frameId: data.frameId,
            documentId: data.documentId,
            eventSequence: data.eventSequence,
            runtimeEventSequence: session.runtimeEventSequence,
            status: session.status,
          });
        }
        const runtimeEventSequence = Number.isInteger(result.runtimeEventSequence)
          ? result.runtimeEventSequence
          : Number.isInteger(result.eventSequence) ? result.eventSequence : null;
        if (runtimeEventSequence === null
          || runtimeEventSequence !== data.eventSequence + 1
          || result.setupComplete !== true) {
          return this._respond({
            success: false,
            error: 'LIVE_DUBBING_PROVIDER_SETUP_INCOMPLETE',
            ignored: true,
            sessionId: data.sessionId,
            providerId: data.providerId,
            tabId: data.tabId,
            frameId: data.frameId,
            documentId: data.documentId,
            eventSequence: data.eventSequence,
            runtimeEventSequence: session.runtimeEventSequence,
            status: session.status,
          });
        }

        session.runtimeEventSequence = runtimeEventSequence;
        session.status = FIREFOX_CONTENT_STATUS.RUNNING;
        const response = {
          success: true,
          ack: FIREFOX_CONTENT_ACKS.PROVIDER_READY,
          providerReady: true,
          active: true,
          prepared: true,
          sessionId: session.sessionId,
          providerId: session.providerId,
          tabId: session.tabId,
          frameId: session.frameId,
          documentId: session.documentId,
          targetLanguage: session.targetLanguage,
          eventSequence: data.eventSequence,
          runtimeEventSequence,
          setupComplete: true,
          status: session.status,
        };
        session.connectResult = response;
        return this._respond(response);
      })
      .catch(() => this._respond({
        success: false,
        error: 'LIVE_DUBBING_PROVIDER_ERROR',
        ignored: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        eventSequence: data.eventSequence,
        runtimeEventSequence: session.runtimeEventSequence,
        status: session.status,
      }))
      .finally(() => {
        session.connectPromise = null;
      });
    return session.connectPromise;
  }

  _connectFeatureRuntime(descriptor) {
    const lifecycle = this.featureLifecycle;
    if (!lifecycle || typeof lifecycle.connectFeatureRuntime !== 'function') {
      return { success: false, error: 'LIVE_DUBBING_RUNTIME_NOT_PREPARED', ignored: true };
    }
    return lifecycle.connectFeatureRuntime(LIVE_DUBBING_FEATURE_NAME, descriptor);
  }

  _readRuntimeEventSequence(fallbackEventSequence) {
    try {
      const sequence = this.featureLifecycle?.getRuntimeEventSequence?.(LIVE_DUBBING_FEATURE_NAME);
      return Number.isInteger(sequence) && sequence >= 0 ? sequence : fallbackEventSequence + 1;
    } catch {
      return fallbackEventSequence + 1;
    }
  }

  _isLiveDubbingActive() {
    try {
      return typeof this.featureLifecycle?.isFeatureActive !== 'function'
        || this.featureLifecycle.isFeatureActive(LIVE_DUBBING_FEATURE_NAME) === true;
    } catch {
      return false;
    }
  }

  _runtimeNotPrepared(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_RUNTIME_NOT_PREPARED',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      runtimeEventSequence: this.session?.runtimeEventSequence ?? null,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _runtimeSequenceMismatch(data, session) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: session.runtimeEventSequence,
      runtimeEventSequence: session.runtimeEventSequence,
      status: session.status,
    });
  }

  _status(data) {
    const session = this.session;
    if (!session) {
      return this._respond({
        success: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: false,
        prepared: false,
        status: TERMINAL_STATUS,
      });
    }
    if (session.sessionId !== data.sessionId
      || session.providerId !== data.providerId
      || session.tabId !== data.tabId) {
      return this._sessionMismatch(data);
    }
    const statusEventSequence = session.connectResult
      ? session.runtimeEventSequence
      : session.eventSequence;
    if (statusEventSequence !== data.eventSequence) {
      return session.connectResult
        ? this._runtimeSequenceMismatch(data, session)
        : this._sequenceMismatch(data);
    }

    return this._respond({
      success: true,
      sessionId: session.sessionId,
      providerId: session.providerId,
      tabId: session.tabId,
      frameId: session.frameId,
      documentId: session.documentId,
      targetLanguage: session.targetLanguage,
      eventSequence: statusEventSequence,
      runtimeEventSequence: session.runtimeEventSequence,
      active: this._activeFact(),
      prepared: true,
      status: session.status,
    });
  }

  async _dispose(data) {
    if (this.session?.connectPromise) this.session.connectInvalidated = true;
    if (this.disposedSession
      && this.disposedSession.sessionId === data.sessionId
      && this.disposedSession.providerId === data.providerId) {
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.DISPOSED,
        disposed: true,
        idempotent: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: false,
        status: TERMINAL_STATUS,
      });
    }

    const pending = this.pendingPreparation;
    if (pending
      && pending.data.sessionId === data.sessionId
      && pending.data.providerId === data.providerId
      && pending.data.tabId === data.tabId) {
      pending.cancelled = true;
      this.pendingPreparation = null;
      this.disposedSession = { sessionId: pending.data.sessionId, providerId: pending.data.providerId };
      await this._deactivateFeatureOnce();
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.DISPOSED,
        disposed: true,
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: false,
        status: TERMINAL_STATUS,
      });
    }

    const session = this.session;
    if (!session || session.sessionId !== data.sessionId) {
      return this._respond({
        success: true,
        ack: FIREFOX_CONTENT_ACKS.DISPOSED,
        disposed: true,
        idempotent: !session,
        ignored: Boolean(session),
        sessionId: data.sessionId,
        providerId: data.providerId,
        tabId: data.tabId,
        frameId: data.frameId,
        documentId: data.documentId,
        eventSequence: data.eventSequence,
        active: Boolean(session),
        status: session?.status || TERMINAL_STATUS,
      });
    }
    // Exact session identity is the terminal fence; sequence drift on a
    // retried DISPOSE is expected and must not block terminal cleanup.
    if (session.providerId !== data.providerId || session.tabId !== data.tabId) {
      return this._sessionMismatch(data);
    }

    // Deactivate exactly once, then dispose host state. Teardown failures
    // must not block the terminal fence; the tombstone below runs regardless.
    // Repeated DISPOSE resolves through the tombstone above and never
    // re-enters deactivation.
    await this._deactivateFeatureOnce();
    this.disposedSession = { sessionId: session.sessionId, providerId: session.providerId };
    this.session = null;
    return this._respond({
      success: true,
      ack: FIREFOX_CONTENT_ACKS.DISPOSED,
      disposed: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      active: false,
      status: TERMINAL_STATUS,
    });
  }

  /**
   * Request lazy feature activation through the injected seam. Resolves true
   * only on a confirmed active feature; missing seams, refusals, and throws
   * all resolve false so PREPARE fails closed with no partial PREPARED.
   * @returns {Promise<boolean>}
   */
  async _requestFeatureActivation() {
    const lifecycle = this.featureLifecycle;
    if (!lifecycle || typeof lifecycle.requestActivation !== 'function') return false;
    try {
      const handler = await lifecycle.requestActivation(LIVE_DUBBING_FEATURE_NAME);
      if (!handler) return false;
      if (typeof lifecycle.isFeatureActive === 'function'
        && lifecycle.isFeatureActive(LIVE_DUBBING_FEATURE_NAME) !== true) return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask only the active Live Dubbing handler to prepare its local runtime.
   * The host passes the already-validated descriptor but never inspects or
   * owns the handler's DOM, media, or Controller resources.
   * @param {object} descriptor validated content descriptor
   * @returns {Promise<boolean>}
   */
  async _prepareFeatureRuntime(descriptor) {
    const lifecycle = this.featureLifecycle;
    if (!lifecycle || typeof lifecycle.prepareRuntime !== 'function') return false;
    try {
      return await lifecycle.prepareRuntime(LIVE_DUBBING_FEATURE_NAME, descriptor) === true;
    } catch {
      return false;
    }
  }

  /**
   * Start (or join) the single-flight session teardown, retained as the
   * barrier record. Repeated invalidate/DISPOSE calls reuse the exact same
   * cleanup instead of fanning out. The confirmed-cleanup boolean is
   * published on settlement: success releases the barrier, failure persists
   * it so adoption stays barred. Either way the record releases only for
   * its own generation, so a stale completion never clears a newer barrier
   * and never touches any session. Teardown failures never block or reopen
   * the terminal fence.
   * @returns {Promise<boolean>} the shared confirmed-cleanup outcome
   */
  _deactivateFeatureOnce() {
    if (this.teardown) return this.teardown.promise;
    const lifecycle = this.featureLifecycle;
    const record = { promise: null, cleaned: null, retry: null };
    this.teardown = record;
    record.promise = (async () => {
      let cleaned = false;
      try {
        if (lifecycle && typeof lifecycle.deactivateFeature === 'function') {
          cleaned = (await lifecycle.deactivateFeature(LIVE_DUBBING_FEATURE_NAME)) === true;
        }
      } catch {
        cleaned = false;
      } finally {
        if (this.teardown === record) {
          record.cleaned = cleaned;
          if (cleaned) this.teardown = null;
        }
      }
      return cleaned;
    })();
    return record.promise;
  }

  /**
   * Whether a fresh adoption may proceed. No barrier means yes. An
   * in-flight teardown is awaited bounded; a failed teardown triggers one
   * controlled single-flight retry. Anything but confirmed-clean fails
   * closed without adopting. Never touches sessions.
   * @returns {Promise<boolean>}
   */
  async _adoptionMayProceed() {
    const record = this.teardown;
    if (!record) return true;
    if (record.cleaned === false) {
      return await this._retryTeardown(record);
    }
    if (await this._boundedTeardownWait(record.promise) !== true) return false;
    // Success releases the barrier before awaiters resume; anything else
    // stays barred, so only an absent barrier proceeds.
    return this.teardown === null;
  }

  /**
   * Controlled single-flight retry for a failed teardown barrier.
   * Concurrent adoptions share one retry attempt; its success releases the
   * barrier, and a settled failure keeps it barred with the retry slot
   * reopened for a later deterministic retry. An expired wait remains tied
   * to the in-flight retry so it cannot overlap cleanup. Stale completion
   * releases only its own record and never touches sessions.
   * @param {object} record the failed barrier record
   * @returns {Promise<boolean>} confirmed-clean or fail-closed
   */
  async _retryTeardown(record) {
    if (this.teardown !== record) return false;
    if (!record.retry) {
      const lifecycle = this.featureLifecycle;
      record.retry = (async () => {
        let cleaned = false;
        try {
          // Publish the single-flight slot before invoking a possibly
          // synchronous lifecycle seam.
          await Promise.resolve();
          if (lifecycle && typeof lifecycle.deactivateFeature === 'function') {
            cleaned = (await lifecycle.deactivateFeature(LIVE_DUBBING_FEATURE_NAME)) === true;
          }
        } catch {
          cleaned = false;
        }
        if (this.teardown === record) {
          if (cleaned) this.teardown = null;
          else record.retry = null;
        }
        return cleaned;
      })();
    }
    const cleaned = await this._boundedTeardownWait(record.retry);
    return cleaned === true && this.teardown === null;
  }

  /**
   * Await a teardown settlement, bounded. Resolves true only on a
   * confirmed-clean settlement; expiry (or rejection) resolves false so the
   * caller fails closed. Never starts teardown and never touches sessions.
   * @param {Promise<boolean>} settlement shared teardown settlement
   * @returns {Promise<boolean>}
   */
  async _boundedTeardownWait(settlement) {
    let timeoutId;
    try {
      const expiry = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(false), this.teardownTimeoutMs);
      });
      const outcome = await Promise.race([
        Promise.resolve(settlement).then(value => value, () => false),
        expiry,
      ]);
      return outcome === true;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  _isTombstoned(data) {
    return Boolean(this.disposedSession
      && this.disposedSession.sessionId === data.sessionId
      && this.disposedSession.providerId === data.providerId);
  }

  _disposedFailure(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_SESSION_DISPOSED',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: this.session?.eventSequence ?? data.eventSequence,
      status: TERMINAL_STATUS,
    });
  }

  /**
   * Optional scalar active fact for STATUS. Session-based when the seam
   * reports no `isFeatureActive`; never activates.
   * @returns {boolean}
   */
  _activeFact() {
    try {
      if (this.featureLifecycle && typeof this.featureLifecycle.isFeatureActive === 'function') {
        return this.featureLifecycle.isFeatureActive(LIVE_DUBBING_FEATURE_NAME) === true;
      }
    } catch {
      return false;
    }
    return true;
  }

  _activationBlocked(data, eventSequence, status) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_ACTIVATION_BLOCKED',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence,
      status,
    });
  }

  _sessionBusy(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_SESSION_BUSY',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _sessionMismatch(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_SESSION_MISMATCH',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: data.eventSequence,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _sequenceMismatch(data) {
    return this._respond({
      success: false,
      error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
      ignored: true,
      sessionId: data.sessionId,
      providerId: data.providerId,
      tabId: data.tabId,
      frameId: data.frameId,
      documentId: data.documentId,
      eventSequence: this.session?.eventSequence ?? 0,
      status: this.session?.status || TERMINAL_STATUS,
    });
  }

  _respond(response) {
    return sanitizeFirefoxContentResponse(response) || {
      success: false,
      error: 'LIVE_DUBBING_ACTION_UNSUPPORTED',
      sessionId: null,
      providerId: null,
      status: TERMINAL_STATUS,
    };
  }
}
