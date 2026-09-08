import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_LEASE_REASONS,
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_STORAGE_KEY,
} from '../constants.js';
import {
  cloneDescriptor,
  createLiveDubbingDiagnostic,
  createConsumeMessage,
  createDescriptor,
  createDisposeMessage,
  createPrepareMessage,
  createSessionMessage,
  createStatusMessage,
  isAcknowledgedForSession,
  isExactSessionResponse,
  normalizeTargetLanguage,
  safeFailureCode,
  sanitizeLiveDubbingDiagnostic,
  sanitizeDescriptor,
} from '../contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.BACKGROUND, 'LiveDubbingCoordinator');

export const LIVE_DUBBING_CLEAR_OUTCOMES = Object.freeze({
  CLEARED: 'CLEARED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
});

function sanitizeStoredDescriptor(value) {
  const sanitized = sanitizeDescriptor(value);
  if (sanitized || value?.status !== 'CONNECTING') return sanitized;

  const normalized = sanitizeDescriptor({
    ...value,
    status: LIVE_DUBBING_STATUS.PREPARING_CAPTURE,
  });
  return normalized ? { ...normalized, status: 'CONNECTING' } : null;
}

function createCaptureStageFailure(stage, error, diagnostic = null) {
  const failure = new Error('Live dubbing capture failed');
  const sanitized = diagnostic
    ? sanitizeLiveDubbingDiagnostic(diagnostic)
    : createLiveDubbingDiagnostic(stage, error);
  failure.captureDiagnostic = { ...sanitized, stage };
  return failure;
}

function createResponseDiagnostic(stage, response, sensitiveValues = []) {
  const sanitized = sanitizeLiveDubbingDiagnostic(response?.diagnostic, { sensitiveValues });
  return sanitized
    ? { ...sanitized, stage }
    : createLiveDubbingDiagnostic(stage, {
      name: 'OffscreenCaptureError',
      message: typeof response?.error === 'string'
        ? response.error
        : 'Offscreen capture request failed',
      code: typeof response?.error === 'string' ? response.error : undefined,
    }, { sensitiveValues });
}

function defaultUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

/**
 * Owns one Chrome tab-capture control-plane session.
 * No media, provider credential, transcript, WebSocket URL, or stream ID is
 * placed in descriptor storage or returned to UI callers.
 */
export class LiveDubbingCoordinator {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || browser;
    this.chromeAPI = options.chromeAPI || globalThis.chrome || this.browserAPI;
    this.leaseManager = options.leaseManager || offscreenRuntimeLeaseManager;
    this.now = options.now || (() => Date.now());
    this.uuid = options.uuid || defaultUuid;
    this.log = options.logger || logger;
    this.descriptor = null;
    this.storageState = LIVE_DUBBING_STORAGE_STATE.ABSENT;
    this.transition = Promise.resolve();
    this.sessionStates = new Map();
    this.cleanupPromises = new Map();
    this.terminalOperations = new Map();
    this.pendingStarts = new Set();
  }

  start(message = {}, sender = {}) {
    const pendingStart = {
      sessionId: this.uuid(),
      terminalRequested: false,
    };
    this.pendingStarts.add(pendingStart);
    const operation = this._enqueue(() => this._start(message, sender, pendingStart));
    void operation.then(
      () => this.pendingStarts.delete(pendingStart),
      () => this.pendingStarts.delete(pendingStart),
    );
    return operation;
  }

  stop(message = {}) {
    return this._stop(message);
  }

  getStatus() {
    return this._enqueue(async () => {
      const available = typeof this.chromeAPI?.tabCapture?.getMediaStreamId === 'function';
      await this._readDescriptor();
      if (this._storageReadFailed()) return this._storageReadFailure();
      if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
      return {
        success: true,
        available,
        status: cloneDescriptor(this.descriptor),
      };
    });
  }

  handleTabRemoved(tabId) {
    return this._stopForTab(tabId, 'TAB_REMOVED');
  }

  handleTopLevelNavigation(tabId) {
    return this._stopForTab(tabId, 'TOP_LEVEL_NAVIGATION');
  }

  handleOffscreenTerminal(message = {}) {
    const sessionId = message?.data?.sessionId || message?.sessionId;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return Promise.resolve({ success: false, error: 'INVALID_SESSION_ID' });
    }

    return this._stopForSession(sessionId, message?.data?.event || 'OFFSCREEN_TERMINAL');
  }

  /**
   * Reconcile session metadata after service-worker restart.
   * Cleanup always uses a concrete session identity.
   */
  reconcile() {
    return this._enqueue(() => this._reconcile());
  }

  _enqueue(operation) {
    const next = this.transition.then(operation, operation);
    this.transition = next.catch(() => {});
    return next;
  }

  async _start(message, sender, pendingStart) {
    const current = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    if (current) {
      return {
        success: false,
        busy: true,
        status: cloneDescriptor(current),
        current: cloneDescriptor(current),
      };
    }

    const targetLanguage = this._getTargetLanguage(message);
    let normalizedLanguage;
    try {
      normalizedLanguage = normalizeTargetLanguage(targetLanguage);
    } catch {
      return { success: false, error: 'INVALID_TARGET_LANGUAGE' };
    }

    const tab = await this._resolveAuthoritativeTab(sender);
    if (!tab || !Number.isInteger(tab.id) || tab.id < 0) {
      return { success: false, error: 'TARGET_TAB_UNAVAILABLE' };
    }

    const getMediaStreamId = this.chromeAPI?.tabCapture?.getMediaStreamId;
    if (typeof getMediaStreamId !== 'function') {
      return { success: false, error: 'TAB_CAPTURE_UNAVAILABLE' };
    }

    const descriptor = createDescriptor({
      sessionId: pendingStart.sessionId,
      tabId: tab.id,
      targetLanguage: normalizedLanguage,
      startedAt: this.now(),
    });
    const sessionState = {
      descriptor,
      leasePromise: null,
      leaseAcquired: false,
      prepared: false,
      terminalRequested: false,
      cleanupCompleted: false,
    };
    this.sessionStates.set(descriptor.sessionId, sessionState);
    if (!await this._writeDescriptor(descriptor)) {
      this._forgetSessionState(descriptor.sessionId, sessionState);
      return this._storageWriteFailure();
    }

    if (pendingStart.terminalRequested || sessionState.terminalRequested) {
      sessionState.terminalRequested = true;
      sessionState.cleanupCompleted = true;
      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED) {
        this._forgetSessionState(descriptor.sessionId, sessionState);
        return { success: false, error: 'LIVE_DUBBING_START_CANCELLED' };
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId, sessionState);
        return {
          success: false,
          error: 'LIVE_DUBBING_START_CANCELLED',
          ignored: true,
          status: cloneDescriptor(this.descriptor),
        };
      }
      return this._storageClearFailure(descriptor);
    }

    let leaseAcquired = false;
    try {
      sessionState.leasePromise = Promise.resolve(this.leaseManager.acquire({
        owner: LIVE_DUBBING_OWNER,
        leaseId: descriptor.sessionId,
        requiredReasons: [...LIVE_DUBBING_LEASE_REASONS],
      }));
      leaseAcquired = await sessionState.leasePromise;
      sessionState.leaseAcquired = leaseAcquired;
      if (!leaseAcquired) throw new Error('offscreen lease unavailable');

      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');
      const prepareResponse = await this._sendCaptureStage(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
        createPrepareMessage(descriptor),
      );
      if (!isAcknowledgedForSession(prepareResponse, 'READY', descriptor.sessionId)) {
        throw createCaptureStageFailure(
          LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
          null,
          createResponseDiagnostic(LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE, prepareResponse),
        );
      }
      sessionState.prepared = true;
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');

      // Keep stream ID ephemeral. It is forwarded in exactly one targeted message.
      let streamId;
      try {
        streamId = await getMediaStreamId.call(this.chromeAPI.tabCapture, {
          targetTabId: descriptor.tabId,
        });
        if (typeof streamId !== 'string' || !streamId) {
          throw new TypeError('getMediaStreamId returned no stream ID');
        }
      } catch (error) {
        throw createCaptureStageFailure(
          LIVE_DUBBING_CAPTURE_STAGES.GET_MEDIA_STREAM_ID,
          error,
        );
      }
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');
      const consumeMessage = createConsumeMessage(descriptor, streamId);
      const consumeResponse = await this._sendCaptureStage(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
        consumeMessage,
        [streamId],
      );
      if (!isAcknowledgedForSession(consumeResponse, 'MEDIA_ACQUIRED', descriptor.sessionId)) {
        throw createCaptureStageFailure(
          LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
          null,
          createResponseDiagnostic(
            LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
            consumeResponse,
            [streamId],
          ),
        );
      }
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');

      const activeDescriptor = this._advance(descriptor, LIVE_DUBBING_STATUS.CAPTURING);
      if (!await this._writeDescriptor(activeDescriptor)) {
        throw new Error('Live dubbing descriptor persistence failed');
      }
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');
      return { success: true, status: cloneDescriptor(activeDescriptor) };
    } catch (error) {
      const failureCode = safeFailureCode('START');
      const diagnostic = error?.captureDiagnostic || null;
      if (diagnostic) this.log.warn('Live dubbing capture failed', diagnostic);
      if (!sessionState.terminalRequested) {
        const failedDescriptor = this._advance(descriptor, LIVE_DUBBING_STATUS.ERROR, failureCode);
        await this._writeDescriptor(failedDescriptor).catch(() => {});
      }

      const cleanup = sessionState.cleanupCompleted
        ? { success: true }
        : leaseAcquired || sessionState.prepared || sessionState.terminalRequested
        ? await this._disposeAndRelease(descriptor).catch(() => ({ success: false }))
        : { success: true };

      if (!cleanup.success) {
        this.log.warn('Live dubbing cleanup remains pending');
        return { success: false, error: failureCode, cleanupPending: true };
      }

      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE) {
        return this._storageClearFailure(descriptor, failureCode);
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId, sessionState);
        return {
          success: false,
          error: failureCode,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
        };
      }
      this._forgetSessionState(descriptor.sessionId, sessionState);
      return { success: false, error: failureCode };
    } finally {
      if (this.sessionStates.get(descriptor.sessionId) === sessionState) {
        sessionState.leasePromise = null;
      }
    }
  }

  async _stop(message) {
    const current = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    const sessionId = message?.data?.sessionId || message?.sessionId;
    if (!current) {
      const pending = this._findPendingStart(sessionId);
      if (pending) {
        pending.terminalRequested = true;
        return { success: true, stopped: false, pending: true, status: null };
      }
      return { success: true, stopped: false, idempotent: true, status: null };
    }

    if (sessionId !== current.sessionId) {
      return { success: true, stopped: false, ignored: true, status: cloneDescriptor(current) };
    }

    return this._stopDescriptor(current, 'STOP_REQUESTED');
  }

  async _stopForSession(sessionId, reason) {
    const current = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    if (!current) {
      const pending = this._findPendingStart(sessionId);
      if (pending) {
        pending.terminalRequested = true;
        return { success: true, stopped: false, pending: true, status: null, reason };
      }
      return { success: true, stopped: false, ignored: true, status: null };
    }

    if (current.sessionId !== sessionId) {
      return { success: true, stopped: false, ignored: true, status: cloneDescriptor(current) };
    }

    return this._stopDescriptor(current, reason);
  }

  async _stopForTab(tabId, reason) {
    if (!Number.isInteger(tabId) || tabId < 0) return { success: true, stopped: false };

    const current = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    if (!current || current.tabId !== tabId) {
      if (!current) {
        const pending = this._findPendingStart();
        if (pending) {
          pending.terminalRequested = true;
          return { success: true, stopped: false, pending: true, status: null, reason };
        }
      }
      return { success: true, stopped: false, ignored: true };
    }

    return this._stopDescriptor(current, reason);
  }

  async _stopDescriptor(descriptor, reason) {
    const existingTerminal = this.terminalOperations.get(descriptor.sessionId);
    if (existingTerminal) return existingTerminal;

    let state = this.sessionStates.get(descriptor.sessionId);
    if (!state) {
      state = {
        descriptor,
        leasePromise: null,
        leaseAcquired: this._hasLiveLease(descriptor.sessionId),
        prepared: true,
        terminalRequested: true,
        cleanupCompleted: false,
      };
      this.sessionStates.set(descriptor.sessionId, state);
    }
    if (state) state.terminalRequested = true;

    const terminalOperation = (async () => {
      if (state.cleanupCompleted) {
        const cleared = await this._clearDescriptor(descriptor.sessionId);
        if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED) {
          this._forgetSessionState(descriptor.sessionId, state);
          return { success: true, stopped: true, status: null, reason };
        }
        if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
          this._forgetSessionState(descriptor.sessionId, state);
          return {
            success: true,
            stopped: false,
            ignored: true,
            status: cloneDescriptor(this.descriptor),
            reason,
          };
        }
        return this._storageClearFailure(descriptor);
      }

      const stopping = this._advance(descriptor, LIVE_DUBBING_STATUS.STOPPING);
      if (!await this._writeDescriptor(stopping, descriptor.sessionId)) {
        return this._storageWriteFailure();
      }
      const cleanup = await this._disposeAndRelease(descriptor, {
        releaseLease: state ? undefined : this._hasLiveLease(descriptor.sessionId),
      });
      if (!cleanup.success) {
        const failed = this._advance(stopping, LIVE_DUBBING_STATUS.ERROR, 'STOP_FAILED');
        await this._writeDescriptor(failed, descriptor.sessionId).catch(() => {});
        return { success: false, error: 'STOP_FAILED', cleanupPending: true };
      }

      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE) {
        return this._storageClearFailure(descriptor);
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId, state);
        return {
          success: true,
          stopped: false,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
          reason,
        };
      }
      this._forgetSessionState(descriptor.sessionId, state);
      return { success: true, stopped: true, status: null, reason };
    })();

    this.terminalOperations.set(descriptor.sessionId, terminalOperation);
    terminalOperation.then(
      () => {
        if (this.terminalOperations.get(descriptor.sessionId) === terminalOperation) {
          this.terminalOperations.delete(descriptor.sessionId);
        }
      },
      () => {
        if (this.terminalOperations.get(descriptor.sessionId) === terminalOperation) {
          this.terminalOperations.delete(descriptor.sessionId);
        }
      },
    );
    return terminalOperation;
  }

  async _disposeAndRelease(descriptor, options = {}) {
    const existing = this.cleanupPromises.get(descriptor.sessionId);
    if (existing) return existing;

    const cleanup = this._disposeAndReleaseOnce(descriptor, options);
    this.cleanupPromises.set(descriptor.sessionId, cleanup);
    cleanup.then(
      () => {
        if (this.cleanupPromises.get(descriptor.sessionId) === cleanup) {
          this.cleanupPromises.delete(descriptor.sessionId);
        }
      },
      () => {
        if (this.cleanupPromises.get(descriptor.sessionId) === cleanup) {
          this.cleanupPromises.delete(descriptor.sessionId);
        }
      },
    );
    return cleanup;
  }

  async _disposeAndReleaseOnce(descriptor, options = {}) {
    const state = this.sessionStates.get(descriptor.sessionId);
    let leaseAcquired = options.releaseLease ?? state?.leaseAcquired ?? false;

    if (state?.leasePromise && options.releaseLease === undefined) {
      try {
        leaseAcquired = await state.leasePromise;
        state.leaseAcquired = leaseAcquired;
      } catch {
        leaseAcquired = false;
      }
    }

    try {
      const response = await this._sendOffscreen(createDisposeMessage(descriptor));
      if (response?.ack !== 'DISPOSED'
        || !isAcknowledgedForSession(response, 'DISPOSED', descriptor.sessionId)
        || response.ignored === true) {
        return { success: false };
      }

      if (leaseAcquired) {
        const released = await this.leaseManager.release({
          owner: LIVE_DUBBING_OWNER,
          leaseId: descriptor.sessionId,
        });
        if (released === false) return { success: false };
      }
      if (state) state.cleanupCompleted = true;
      return { success: true };
    } catch {
      this.log.warn('Live dubbing disposal did not complete');
      return { success: false };
    }
  }

  async _reconcile() {
    const descriptor = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    const terminalState = descriptor && this.sessionStates.get(descriptor.sessionId);
    if (terminalState?.terminalRequested && terminalState.cleanupCompleted) {
      const cleanupRetry = await this._stopDescriptor(descriptor, 'RECONCILE_CLEANUP');
      return {
        ...cleanupRetry,
        stale: cleanupRetry.success || cleanupRetry.cleanupPending === true,
        recovered: false,
      };
    }
    try {
      await this.leaseManager.ensureDocument?.();
    } catch {
      // Reconciliation is best effort; retain descriptor for next worker start.
    }

    const snapshot = this.leaseManager.getSnapshot?.() || { activeLeases: [] };
    const leases = snapshot.activeLeases || snapshot.leases || [];

    const liveLeases = leases.filter(item => item.owner === LIVE_DUBBING_OWNER
      && typeof item.leaseId === 'string' && item.leaseId.trim());

    if (!descriptor) {
      let cleaned = true;
      for (const lease of liveLeases) {
        cleaned = (await this._reconcileLease(lease, true)) && cleaned;
      }
      return { success: cleaned, status: null, recovered: false, stale: liveLeases.length > 0 };
    }

    let matchingLease = liveLeases.find(item => item.leaseId === descriptor.sessionId);
    if (snapshot.documentExists === false && !matchingLease) {
      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          status: null,
          stale: true,
          recovered: false,
          retryable: false,
        };
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          stopped: false,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
          stale: true,
          recovered: false,
        };
      }
      return {
        success: false,
        status: cloneDescriptor(this.descriptor || descriptor),
        stale: true,
        recovered: false,
        retryable: true,
        cleanupPending: true,
      };
    }

    const descriptorStatus = await this._queryStatus(descriptor, descriptor.sessionId);
    if (this._isSessionMismatch(descriptorStatus, descriptor.sessionId)) {
      // Never dispose or release while offscreen reports another session.
      return {
        success: false,
        error: 'LIVE_DUBBING_SESSION_MISMATCH',
        status: cloneDescriptor(descriptor),
        recovered: false,
        retryable: true,
        isolated: true,
      };
    }

    if (this._isCapturingStatus(descriptorStatus, descriptor.sessionId)) {
      if (!matchingLease) {
        const acquired = await this._acquireRecoveryLease(descriptor.sessionId);
        if (!acquired) {
          this._rememberReconciledSession(descriptor, false);
          const failed = this._advance(
            descriptor,
            LIVE_DUBBING_STATUS.ERROR,
            'LIVE_DUBBING_LEASE_ACQUIRE_FAILED',
          );
          await this._writeDescriptor(failed, descriptor.sessionId).catch(() => {});
          return {
            success: false,
            error: 'LIVE_DUBBING_LEASE_ACQUIRE_FAILED',
            status: cloneDescriptor(failed),
            recovered: false,
            retryable: true,
          };
        }
        matchingLease = {
          owner: LIVE_DUBBING_OWNER,
          leaseId: descriptor.sessionId,
          requiredReasons: [...LIVE_DUBBING_LEASE_REASONS],
        };
      }

      const activeDescriptor = descriptor.status === LIVE_DUBBING_STATUS.CAPTURING
        ? descriptor
        : this._advance(descriptor, LIVE_DUBBING_STATUS.CAPTURING);
      this._rememberReconciledSession(activeDescriptor, Boolean(matchingLease));

      const persisted = descriptor.status === LIVE_DUBBING_STATUS.CAPTURING
        || await this._writeDescriptor(activeDescriptor, descriptor.sessionId);
      if (!persisted) {
        return {
          success: false,
          status: cloneDescriptor(descriptor),
          recovered: false,
          retryable: true,
        };
      }

      let cleaned = true;
      for (const lease of liveLeases.filter(item => item.leaseId !== descriptor.sessionId)) {
        cleaned = (await this._reconcileLease(lease, true)) && cleaned;
      }

      return {
        success: cleaned,
        status: cloneDescriptor(activeDescriptor),
        recovered: true,
      };
    }

    const documentAndSessionAbsent = !matchingLease
      && this._isProvablyAbsent(descriptorStatus, descriptor.sessionId);
    if (documentAndSessionAbsent) {
      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          status: null,
          stale: true,
          recovered: false,
          retryable: false,
        };
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          stopped: false,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
          stale: true,
          recovered: false,
        };
      }
      return {
        success: false,
        status: cloneDescriptor(this.descriptor || descriptor),
        stale: true,
        recovered: false,
        retryable: true,
        cleanupPending: true,
      };
    }

    this._rememberReconciledSession(descriptor, Boolean(matchingLease));
    const cleanup = await this._disposeAndRelease(descriptor, {
      releaseLease: Boolean(matchingLease),
    });
    if (cleanup.success) {
      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          status: null,
          stale: true,
          retryable: false,
        };
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId);
        return {
          success: true,
          stopped: false,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
          stale: true,
        };
      }
      return {
        success: false,
        status: cloneDescriptor(this.descriptor || descriptor),
        stale: true,
        retryable: true,
        cleanupPending: true,
      };
    }

    const failed = this._advance(
      descriptor,
      LIVE_DUBBING_STATUS.ERROR,
      safeFailureCode('RECONCILE'),
    );
    await this._writeDescriptor(failed, descriptor.sessionId).catch(() => {});
    return {
      success: false,
      status: cloneDescriptor(failed),
      stale: true,
      retryable: true,
      cleanupPending: true,
    };
  }

  async _queryStatus(descriptor, sessionId) {
    try {
      const response = await this._sendOffscreen(
        descriptor?.sessionId === sessionId
          ? createStatusMessage(descriptor)
          : createSessionMessage(LIVE_DUBBING_ACTIONS.STATUS, sessionId),
      );
      return response || null;
    } catch {
      return null;
    }
  }

  async _reconcileLease(lease, stale) {
    const sessionId = lease.leaseId;
    const status = await this._queryStatus(null, sessionId);
    if (!status || status.sessionId !== sessionId || status.success === false
      || this._isSessionMismatch(status, sessionId)) return false;
    if (!stale && !this._isExplicitlyInactive(status)) return true;

    const cleanup = await this._disposeAndRelease({ sessionId }, { releaseLease: true });
    return cleanup.success;
  }

  async _acquireRecoveryLease(sessionId) {
    try {
      return await this.leaseManager.acquire({
        owner: LIVE_DUBBING_OWNER,
        leaseId: sessionId,
        requiredReasons: [...LIVE_DUBBING_LEASE_REASONS],
      }) === true;
    } catch {
      this.log.warn('Live dubbing recovery lease acquisition failed');
      return false;
    }
  }

  _rememberReconciledSession(descriptor, leaseAcquired) {
    const current = this.sessionStates.get(descriptor.sessionId);
    if (current) {
      current.descriptor = descriptor;
      current.leaseAcquired = leaseAcquired;
      current.prepared = true;
      current.cleanupCompleted = false;
      return;
    }

    this.sessionStates.set(descriptor.sessionId, {
      descriptor,
      leasePromise: null,
      leaseAcquired,
      prepared: true,
      terminalRequested: false,
      cleanupCompleted: false,
    });
  }

  _forgetSessionState(sessionId, expectedState = null) {
    if (expectedState && this.sessionStates.get(sessionId) !== expectedState) return;
    this.sessionStates.delete(sessionId);
  }

  _hasLiveLease(sessionId) {
    try {
      const snapshot = this.leaseManager.getSnapshot?.() || {};
      const leases = snapshot.activeLeases || snapshot.leases || [];
      return leases.some(item => item.owner === LIVE_DUBBING_OWNER && item.leaseId === sessionId);
    } catch {
      return false;
    }
  }

  _isSessionMismatch(response, sessionId) {
    return Boolean(response && (
      response.sessionId !== sessionId
      || (Object.prototype.hasOwnProperty.call(response, 'requestedSessionId')
        && response.requestedSessionId !== sessionId)
      || (Object.prototype.hasOwnProperty.call(response, 'actualSessionId')
        && response.actualSessionId !== sessionId)
    ));
  }

  _isExactSessionStatus(response, sessionId) {
    return Boolean(response
      && response.success !== false
      && isExactSessionResponse(response, sessionId)
      && typeof response.status === 'string');
  }

  _isCapturingStatus(response, sessionId) {
    return this._isExactSessionStatus(response, sessionId)
      && response.status === LIVE_DUBBING_STATUS.CAPTURING
      && response.active === true;
  }

  _isProvablyAbsent(response, sessionId) {
    return this._isExactSessionStatus(response, sessionId)
      && (['IDLE', 'DISPOSED', 'MISSING'].includes(response.status)
        || response.disposed === true);
  }

  _isExplicitlyInactive(response) {
    return Boolean(response && response.success !== false
      && (response.active === false
        || ['IDLE', 'DISPOSED', 'MISSING'].includes(response.status)
        || response.disposed === true));
  }

  _advance(descriptor, status, lastError = null) {
    return {
      ...descriptor,
      status,
      lastError,
      eventSequence: descriptor.eventSequence + 1,
    };
  }

  async _resolveAuthoritativeTab(sender) {
    const senderTabId = sender?.tab?.id;
    const extensionUrl = this.browserAPI.runtime?.getURL?.('');
    const senderIsExtensionPage = typeof sender?.url === 'string'
      && typeof extensionUrl === 'string'
      && sender.url.startsWith(extensionUrl);

    if (!senderIsExtensionPage && Number.isInteger(senderTabId) && senderTabId >= 0) {
      if (typeof this.browserAPI.tabs?.get === 'function') {
        try {
          return await this.browserAPI.tabs.get(senderTabId);
        } catch {
          return null;
        }
      }
      return sender.tab;
    }

    if (typeof this.browserAPI.tabs?.query !== 'function') return null;
    const tabs = await this.browserAPI.tabs.query({ active: true, currentWindow: true });
    return tabs?.[0] || null;
  }

  _getTargetLanguage(message) {
    return message?.data?.targetLanguage
      ?? message?.targetLanguage;
  }

  _findPendingStart(sessionId) {
    return [...this.pendingStarts].find(pending => !sessionId || pending.sessionId === sessionId);
  }

  async _sendOffscreen(message) {
    if (typeof this.browserAPI.runtime?.sendMessage !== 'function') {
      throw new Error('offscreen messaging unavailable');
    }

    return this.browserAPI.runtime.sendMessage(message);
  }

  async _sendCaptureStage(stage, message, sensitiveValues = []) {
    try {
      return await this._sendOffscreen(message);
    } catch (error) {
      throw createCaptureStageFailure(
        stage,
        error,
        createLiveDubbingDiagnostic(stage, error, { sensitiveValues }),
      );
    }
  }

  _storageReadFailed() {
    return this.storageState === LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
  }

  _storageDescriptorInvalid() {
    return this.storageState === LIVE_DUBBING_STORAGE_STATE.PRESENT && !this.descriptor;
  }

  _storageReadFailure() {
    return {
      success: false,
      error: 'LIVE_DUBBING_STORAGE_UNREADABLE',
      retryable: true,
      status: cloneDescriptor(this.descriptor),
    };
  }

  _storageDescriptorFailure() {
    return {
      success: false,
      error: 'LIVE_DUBBING_STORAGE_DESCRIPTOR_INVALID',
      retryable: true,
      status: cloneDescriptor(this.descriptor),
    };
  }

  _storageWriteFailure() {
    return {
      success: false,
      error: 'LIVE_DUBBING_STORAGE_UNWRITABLE',
      retryable: true,
      status: cloneDescriptor(this.descriptor),
    };
  }

  _storageClearFailure(descriptor, error = 'LIVE_DUBBING_STORAGE_CLEAR_FAILED') {
    return {
      success: false,
      error,
      retryable: true,
      cleanupPending: true,
      status: cloneDescriptor(this.descriptor || descriptor),
    };
  }

  async _readDescriptor() {
    const storage = this.browserAPI.storage?.session;
    if (typeof storage?.get !== 'function') {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      return this.descriptor;
    }

    try {
      const result = await storage.get(LIVE_DUBBING_STORAGE_KEY);
      const stored = result?.[LIVE_DUBBING_STORAGE_KEY];
      if (stored === undefined || stored === null) {
        this.storageState = LIVE_DUBBING_STORAGE_STATE.ABSENT;
        this.descriptor = null;
      } else {
        this.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
        this.descriptor = sanitizeStoredDescriptor(stored);
      }
    } catch {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
    }

    return this.descriptor;
  }

  async _writeDescriptor(descriptor, expectedSessionId = null) {
    if (expectedSessionId) {
      const current = await this._readDescriptor();
      if (this._storageReadFailed()) return false;
      if (!current || current.sessionId !== expectedSessionId) return false;
    }
    if (this._storageReadFailed()) return false;

    const sanitized = sanitizeDescriptor(descriptor);
    if (!sanitized) throw new TypeError('Invalid live dubbing descriptor');

    const storage = this.browserAPI.storage?.session;
    if (typeof storage?.set !== 'function') {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      return false;
    }

    const previousDescriptor = this.descriptor;
    try {
      await storage.set({ [LIVE_DUBBING_STORAGE_KEY]: cloneDescriptor(sanitized) });
    } catch {
      // Keep last known descriptor; a failed write cannot establish ownership.
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      this.descriptor = previousDescriptor;
      return false;
    }

    this.descriptor = sanitized;
    this.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
    return true;
  }

  async _clearDescriptor(expectedSessionId = null) {
    if (expectedSessionId) {
      const current = await this._readDescriptor();
      if (this._storageReadFailed()) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
      }
      if (this._storageDescriptorInvalid()) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
      }
      if (!current || current.sessionId !== expectedSessionId) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH };
      }
    }
    if (this._storageReadFailed() || this._storageDescriptorInvalid()) {
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
    }

    const storage = this.browserAPI.storage?.session;
    if (typeof storage?.remove !== 'function' && typeof storage?.set !== 'function') {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
    }

    try {
      if (typeof storage.remove === 'function') {
        await storage.remove(LIVE_DUBBING_STORAGE_KEY);
      } else {
        await storage.set({ [LIVE_DUBBING_STORAGE_KEY]: null });
      }
    } catch {
      // Retain descriptor until storage confirms terminal cleanup.
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
    }

    this.descriptor = null;
    this.storageState = LIVE_DUBBING_STORAGE_STATE.ABSENT;
    return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.CLEARED };
  }
}

export const liveDubbingCoordinator = new LiveDubbingCoordinator();

export { LIVE_DUBBING_ACTIONS };
