import browser from 'webextension-polyfill';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { offscreenRuntimeLeaseManager } from '@/shared/runtime/OffscreenRuntimeLeaseManager.js';
import {
  LIVE_DUBBING_ACTIONS,
  LIVE_DUBBING_CAPTURE_STAGES,
  LIVE_DUBBING_LEASE_REASONS,
  LIVE_DUBBING_OWNER,
  LIVE_DUBBING_PROVIDER_ID,
  LIVE_DUBBING_STORAGE_STATE,
  LIVE_DUBBING_STATUS,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_START_TIMEOUT,
} from '../constants.js';
import {
  cloneDescriptor,
  createLiveDubbingDiagnostic,
  createLiveDubbingProviderDiagnostic,
  createConsumeMessage,
  createDescriptor,
  createDisposeMessage,
  createProviderConnectMessage,
  createPrepareMessage,
  createSessionMessage,
  createStatusMessage,
  hasExactSessionEvent,
  isAuthorizedOffscreenSender,
  isAcknowledgedForSession,
  isExactSessionResponse,
  normalizeProviderTargetLanguage,
  safeFailureCode,
  sanitizeLiveDubbingDiagnostic,
  sanitizeLiveDubbingCleanupDiagnostic,
  sanitizeLiveDubbingProviderDiagnostic,
  sanitizeDescriptor,
} from '../contracts.js';

const logger = getScopedLogger(LOG_COMPONENTS.LIVE_DUBBING, 'LiveDubbingCoordinator');

export const LIVE_DUBBING_CLEAR_OUTCOMES = Object.freeze({
  CLEARED: 'CLEARED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
});

function sanitizeStoredDescriptor(value) {
  return sanitizeDescriptor(value);
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
 * No media, provider bootstrap, transcript, WebSocket URL, or stream ID is
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
    this.bootstrapRequestSessions = new Set();
  }

  start(message = {}, sender = {}) {
    const pendingStart = {
      sessionId: this.uuid(),
      providerId: LIVE_DUBBING_PROVIDER_ID,
      terminalRequested: false,
      startedAt: this.now(),
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

  handleOffscreenTerminal(message = {}, sender = null) {
    const sessionId = message?.data?.sessionId || message?.sessionId;
    const providerId = message?.data?.providerId || message?.providerId;
    if (typeof sessionId !== 'string' || !sessionId.trim()) {
      return Promise.resolve({ success: false, error: 'INVALID_SESSION_ID' });
    }
    if (providerId !== LIVE_DUBBING_PROVIDER_ID) {
      return Promise.resolve({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
    }

    if (sender) {
      if (!isAuthorizedOffscreenSender(sender, this.browserAPI)) {
        return Promise.resolve({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
      }
      const authorized = this._authorizeTerminalRequest(message);
      if (!authorized) {
        return Promise.resolve({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
      }

      const providerDiagnostic = sanitizeLiveDubbingProviderDiagnostic(
        message?.data?.providerDiagnostic || message?.providerDiagnostic,
      );
      this._latchProviderDiagnostic(this.sessionStates.get(sessionId), providerDiagnostic);
      if (providerDiagnostic) this.log.warn('Live dubbing provider terminal', providerDiagnostic);

      const cleanupDiagnostic = sanitizeLiveDubbingCleanupDiagnostic(
        message?.data?.cleanupDiagnostic || message?.cleanupDiagnostic,
      );
      return this._stopForSession(
        sessionId,
        message?.data?.event || 'OFFSCREEN_TERMINAL',
        authorized,
        this.sessionStates.get(sessionId),
      ).then(result => {
        if (result?.success === true && result.stopped === true
          && cleanupDiagnostic?.playbackAccepted === false) {
          this.log.warn('Live dubbing ended without translated playback', cleanupDiagnostic);
        }
        return result;
      });
    }

    if (this.descriptor && this.descriptor.sessionId === sessionId
      && this.descriptor.providerId !== providerId) {
      return Promise.resolve({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED', ignored: true });
    }

    return this._stopForSession(sessionId, message?.data?.event || 'OFFSCREEN_TERMINAL');
  }

  /**
   * Authorize messages emitted by the offscreen document before terminal or
   * bootstrap work reaches session coordination. Terminal events use the
   * owned session identity; bootstrap requests use the descriptor sequence
   * and are one-time per session.
   */
  async authorizeOffscreenControlMessage(message = {}, sender, { type = 'terminal' } = {}) {
    if (!isAuthorizedOffscreenSender(sender, this.browserAPI)) return null;

    if (type === 'terminal') return this._authorizeTerminalRequest(message);

    // Bootstrap requests are part of the provider response currently awaited
    // by start(). They must use the already-persisted in-memory fence instead
    // of waiting behind that same transition.
    if (type === 'bootstrap') return this._authorizeBootstrapRequest(message);

    return this._enqueue(async () => {
      const descriptor = await this._readDescriptor();
      if (this._storageReadFailed() || this._storageDescriptorInvalid()) return null;
      if (!hasExactSessionEvent(message, descriptor)) return null;

      return cloneDescriptor(descriptor);
    });
  }

  /**
   * Terminal events are fenced by the owned session identity only. Offscreen
   * terminal notifications can arrive from an earlier audio event sequence;
   * stop ownership, not that sequence, decides whether they are actionable.
   */
  _authorizeTerminalRequest(message) {
    const descriptor = this.descriptor;
    const data = message?.data || message;
    if (this.storageState !== LIVE_DUBBING_STORAGE_STATE.PRESENT
      || !descriptor
      || data.sessionId !== descriptor.sessionId
      || data.providerId !== descriptor.providerId
      || this.terminalOperations.has(descriptor.sessionId)) {
      return null;
    }

    let state = this.sessionStates.get(descriptor.sessionId);
    if (state?.terminalRequested) return null;
    if (!state) {
      state = {
        descriptor,
        leasePromise: null,
        leaseAcquired: this._hasLiveLease(descriptor.sessionId),
        prepared: true,
        terminalRequested: false,
        cleanupCompleted: false,
        providerDiagnostic: null,
      };
      this.sessionStates.set(descriptor.sessionId, state);
    }

    this._markTerminalState(state);
    return cloneDescriptor(descriptor);
  }

  /**
   * Validate and reserve the one bootstrap request without entering the
   * transition queue. This synchronous section is the atomic active-session
   * fence for the CONNECTING_PROVIDER start transaction.
   */
  _authorizeBootstrapRequest(message) {
    const descriptor = this.descriptor;
    const data = message?.data || message;
    const state = descriptor?.sessionId
      ? this.sessionStates.get(descriptor.sessionId)
      : null;

    if (this.storageState !== LIVE_DUBBING_STORAGE_STATE.PRESENT
      || !descriptor
      || message?.action !== LIVE_DUBBING_ACTIONS.REQUEST_PROVIDER_BOOTSTRAP
      || descriptor.status !== LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
      || !state
      || state.terminalRequested
      || this.terminalOperations.has(descriptor.sessionId)
      || !this._isSameDescriptorFence(state.descriptor, descriptor)
      || !hasExactSessionEvent(message, descriptor)
      || data.providerId !== descriptor.providerId
      || data.targetLanguage !== descriptor.targetLanguage
      || this.bootstrapRequestSessions.has(descriptor.sessionId)) {
      return null;
    }

    this.bootstrapRequestSessions.add(descriptor.sessionId);
    return cloneDescriptor(descriptor);
  }

  /**
   * Recheck the fence after bootstrap resolution. A stop or terminal event
   * can win while the key manager is awaiting, so the key must not be sent
   * after ownership has changed.
   */
  isBootstrapRequestStillAuthorized(descriptor) {
    if (!descriptor?.sessionId) return false;

    const current = this.descriptor;
    const state = this.sessionStates.get(descriptor.sessionId);
    return this.storageState === LIVE_DUBBING_STORAGE_STATE.PRESENT
      && current?.status === LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
      && this._isSameDescriptorFence(current, descriptor)
      && this._isSameDescriptorFence(state?.descriptor, descriptor)
      && !state?.terminalRequested
      && !this.terminalOperations.has(descriptor.sessionId)
      && descriptor.providerId === LIVE_DUBBING_PROVIDER_ID
      && this.bootstrapRequestSessions.has(descriptor.sessionId);
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
    let timeoutId;
    const transaction = this._startTransaction(message, sender, pendingStart);
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        pendingStart.terminalRequested = true;
        const state = this.sessionStates.get(pendingStart.sessionId);
        if (state) this._markTerminalState(state);
        reject(new Error('LIVE_DUBBING_START_TIMEOUT'));
      }, LIVE_DUBBING_START_TIMEOUT);
    });

    try {
      return await Promise.race([transaction, timeout]);
    } catch (error) {
      if (error?.message !== 'LIVE_DUBBING_START_TIMEOUT') throw error;
      const state = this.sessionStates.get(pendingStart.sessionId);
      if (!state) return { success: false, error: 'LIVE_DUBBING_START_TIMEOUT' };

      const cleanup = await this._disposeAndRelease(state.descriptor).catch(() => ({ success: false }));
      if (!cleanup.success) {
        return {
          success: false,
          error: 'LIVE_DUBBING_START_TIMEOUT',
          cleanupPending: true,
          status: cloneDescriptor(this.descriptor || state.descriptor),
        };
      }
      const cleared = await this._clearDescriptor(state.descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE) {
        return this._storageClearFailure(state.descriptor, 'LIVE_DUBBING_START_TIMEOUT');
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(state.descriptor.sessionId, state);
        return {
          success: false,
          error: 'LIVE_DUBBING_START_TIMEOUT',
          ignored: true,
          status: cloneDescriptor(this.descriptor),
        };
      }
      this._forgetSessionState(state.descriptor.sessionId, state);
      return { success: false, error: 'LIVE_DUBBING_START_TIMEOUT' };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async _startTransaction(message, sender, pendingStart) {
    const targetLanguage = this._getTargetLanguage(message);
    let normalizedLanguage;
    try {
      normalizedLanguage = normalizeProviderTargetLanguage(LIVE_DUBBING_PROVIDER_ID, targetLanguage);
    } catch {
      return { success: false, error: 'INVALID_TARGET_LANGUAGE' };
    }

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

    const tab = await this._resolveAuthoritativeTab(sender);
    if (pendingStart.terminalRequested) {
      return { success: false, error: 'LIVE_DUBBING_START_CANCELLED' };
    }
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
      providerId: LIVE_DUBBING_PROVIDER_ID,
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
      providerDiagnostic: null,
    };
    this.sessionStates.set(descriptor.sessionId, sessionState);
    if (!await this._writeDescriptor(descriptor)) {
      this._forgetSessionState(descriptor.sessionId, sessionState);
      return this._storageWriteFailure();
    }

    if (pendingStart.terminalRequested || sessionState.terminalRequested) {
      this._markTerminalState(sessionState);
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
    let providerStartAttempted = false;
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
      if (!isAcknowledgedForSession(prepareResponse, 'READY', descriptor.sessionId, descriptor.providerId)) {
        throw createCaptureStageFailure(
          LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
          null,
          createResponseDiagnostic(LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE, prepareResponse),
        );
      }
      if (prepareResponse.eventSequence !== descriptor.eventSequence) {
        throw createCaptureStageFailure(
          LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE,
          null,
          createResponseDiagnostic(LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_PREPARE, {
            error: 'LIVE_DUBBING_EVENT_SEQUENCE_MISMATCH',
          }),
        );
      }
      sessionState.prepared = true;
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');

      // Reserve the capture fence before offscreen starts getUserMedia or
      // pipeline setup. The offscreen controller adopts this next sequence
      // atomically at the start of CONSUME.
      const captureDescriptor = this._advance(descriptor, LIVE_DUBBING_STATUS.PREPARING_CAPTURE);
      if (!await this._writeDescriptor(captureDescriptor, descriptor.sessionId, descriptor)) {
        throw new Error('Live dubbing descriptor persistence failed');
      }
      sessionState.descriptor = captureDescriptor;
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');

      // Keep stream ID ephemeral. It is forwarded in exactly one targeted message.
      let streamId;
      try {
        streamId = await getMediaStreamId.call(this.chromeAPI.tabCapture, {
          targetTabId: captureDescriptor.tabId,
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
      const consumeMessage = createConsumeMessage(captureDescriptor, streamId);
      const consumeResponse = await this._sendCaptureStage(
        LIVE_DUBBING_CAPTURE_STAGES.OFFSCREEN_GET_USER_MEDIA,
        consumeMessage,
        [streamId],
      );
      if (!isAcknowledgedForSession(consumeResponse, 'MEDIA_ACQUIRED', descriptor.sessionId, descriptor.providerId)) {
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

      // Stage 2 returns CONNECTING_PROVIDER only after capture and both local
      // graphs exist. Persist that fence before the offscreen document asks
      // background for the short-lived provider bootstrap.
      const integratedPipelines = consumeResponse.status === LIVE_DUBBING_STATUS.CONNECTING_PROVIDER
        && consumeResponse.captureReady === true
        && consumeResponse.inputPipelineReady === true
        && consumeResponse.outputPipelineReady === true
        && consumeResponse.eventSequence === captureDescriptor.eventSequence;
      let activeDescriptor = descriptor;
      if (integratedPipelines) {
        const connectingDescriptor = this._advance(
          captureDescriptor,
          LIVE_DUBBING_STATUS.CONNECTING_PROVIDER,
          null,
          captureDescriptor.eventSequence + 1,
        );
        if (!await this._writeDescriptor(
          connectingDescriptor,
          descriptor.sessionId,
          captureDescriptor,
        )) {
          throw new Error('Live dubbing descriptor persistence failed');
        }
        sessionState.descriptor = connectingDescriptor;
        if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');

        providerStartAttempted = true;
        const providerResponse = await this._sendOffscreen(createProviderConnectMessage(connectingDescriptor));
        this._latchProviderDiagnostic(sessionState, providerResponse?.providerDiagnostic);
        const providerReady = isAcknowledgedForSession(
          providerResponse,
          'PROVIDER_READY',
          descriptor.sessionId,
          descriptor.providerId,
        )
          && providerResponse.status === LIVE_DUBBING_STATUS.RUNNING
          && providerResponse.captureReady === true
          && providerResponse.inputPipelineReady === true
          && providerResponse.outputPipelineReady === true
          && providerResponse.setupComplete === true
          && providerResponse.eventSequence === connectingDescriptor.eventSequence + 1;
        if (!providerReady) {
          this._latchProviderDiagnostic(sessionState, createLiveDubbingProviderDiagnostic({
            code: typeof providerResponse?.error === 'string'
              ? providerResponse.error
              : 'LIVE_DUBBING_PROVIDER_SETUP_FAILED',
            terminalCategory: 'PROVIDER_SETUP_FAILED',
            setupComplete: providerResponse?.setupComplete === true,
          }));
          throw new Error('Live dubbing provider setup failed');
        }
        if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');
        activeDescriptor = this._advance(
          connectingDescriptor,
          LIVE_DUBBING_STATUS.RUNNING,
          null,
          providerResponse.eventSequence,
        );
      } else {
        throw new Error('Live dubbing audio pipelines are not ready');
      }
      if (!await this._writeDescriptor(
        activeDescriptor,
        descriptor.sessionId,
        sessionState.descriptor,
      )) {
        throw new Error('Live dubbing descriptor persistence failed');
      }
      sessionState.descriptor = activeDescriptor;
      if (sessionState.terminalRequested) throw new Error('live dubbing terminal requested');
      return { success: true, status: cloneDescriptor(activeDescriptor) };
    } catch (error) {
      const failureCode = safeFailureCode('START');
      const diagnostic = error?.captureDiagnostic || null;
      let providerDiagnostic = this._latchProviderDiagnostic(
        sessionState,
        error?.providerDiagnostic,
      );
      if (providerStartAttempted && !providerDiagnostic && !sessionState.terminalRequested) {
        providerDiagnostic = this._latchProviderDiagnostic(
          sessionState,
          createLiveDubbingProviderDiagnostic({
            code: 'LIVE_DUBBING_PROVIDER_START_FAILED',
            terminalCategory: 'PROVIDER_START_FAILED',
          }),
        );
      }
      if (diagnostic) this.log.warn('Live dubbing capture failed', diagnostic);
      if (providerDiagnostic) {
        this.log.warn('Live dubbing provider startup failed', providerDiagnostic);
      }
      if (!sessionState.terminalRequested) {
        const failedBase = sessionState.descriptor || descriptor;
        const failedDescriptor = this._advance(failedBase, LIVE_DUBBING_STATUS.ERROR, failureCode);
        await this._writeDescriptor(
          failedDescriptor,
          descriptor.sessionId,
          failedBase,
        ).catch(() => {});
      }

      const cleanupDescriptor = sessionState.descriptor || descriptor;
      const cleanup = sessionState.cleanupCompleted
        ? { success: true }
        : leaseAcquired || sessionState.prepared || sessionState.terminalRequested
        ? await this._disposeAndRelease(cleanupDescriptor).catch(() => ({ success: false }))
        : { success: true };

      if (!cleanup.success) {
        this.log.warn('Live dubbing cleanup remains pending');
        return {
          success: false,
          error: failureCode,
          cleanupPending: true,
          ...(providerDiagnostic ? { providerDiagnostic } : {}),
        };
      }

      const cleared = await this._clearDescriptor(descriptor.sessionId);
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE) {
        return {
          ...this._storageClearFailure(descriptor, failureCode),
          ...(providerDiagnostic ? { providerDiagnostic } : {}),
        };
      }
      if (cleared.outcome === LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH) {
        this._forgetSessionState(descriptor.sessionId, sessionState);
        return {
          success: false,
          error: failureCode,
          ignored: true,
          status: cloneDescriptor(this.descriptor),
          ...(providerDiagnostic ? { providerDiagnostic } : {}),
        };
      }
      this._forgetSessionState(descriptor.sessionId, sessionState);
      return {
        success: false,
        error: failureCode,
        ...(providerDiagnostic ? { providerDiagnostic } : {}),
      };
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

  async _stopForSession(sessionId, reason, expectedDescriptor = null, expectedState = null) {
    const current = await this._readDescriptor();
    if (this._storageReadFailed()) return this._storageReadFailure();
    if (this._storageDescriptorInvalid()) return this._storageDescriptorFailure();
    if (!current) {
      if (expectedDescriptor || expectedState) {
        return { success: true, stopped: false, ignored: true, status: null, reason };
      }
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

    if ((expectedState && this.sessionStates.get(sessionId) !== expectedState)
      || (expectedDescriptor && !this._isSameDescriptorFence(current, expectedDescriptor))) {
      return { success: true, stopped: false, ignored: true, status: cloneDescriptor(current), reason };
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
        terminalRequested: false,
        cleanupCompleted: false,
        providerDiagnostic: null,
      };
      this.sessionStates.set(descriptor.sessionId, state);
    }
    this._markTerminalState(state);

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
      if (!await this._writeDescriptor(stopping, descriptor.sessionId, descriptor)) {
        return this._storageWriteFailure();
      }
      const cleanup = await this._disposeAndRelease(descriptor, {
        releaseLease: state ? undefined : this._hasLiveLease(descriptor.sessionId),
      });
      if (!cleanup.success) {
        const failed = this._advance(stopping, LIVE_DUBBING_STATUS.ERROR, 'STOP_FAILED');
        await this._writeDescriptor(failed, descriptor.sessionId, stopping).catch(() => {});
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
        || !isAcknowledgedForSession(response, 'DISPOSED', descriptor.sessionId, descriptor.providerId)
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

    const descriptorStatus = await this._queryStatus(
      descriptor,
      descriptor.sessionId,
      descriptor.providerId,
    );
    if (this._isSessionMismatch(descriptorStatus, descriptor.sessionId, descriptor.providerId)) {
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

    if (this._isRecoverableRunningStatus(
      descriptorStatus,
      descriptor.sessionId,
      descriptor.providerId,
    )) {
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

      const activeDescriptor = descriptor.status === LIVE_DUBBING_STATUS.RUNNING
        ? descriptor
        : this._advance(descriptor, LIVE_DUBBING_STATUS.RUNNING);
      this._rememberReconciledSession(activeDescriptor, Boolean(matchingLease));

      const persisted = descriptor.status === LIVE_DUBBING_STATUS.RUNNING
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
      && this._isProvablyAbsent(descriptorStatus, descriptor.sessionId, descriptor.providerId);
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

  async _queryStatus(descriptor, sessionId, providerId = descriptor?.providerId) {
    try {
      if (providerId !== LIVE_DUBBING_PROVIDER_ID) return null;
      const response = await this._sendOffscreen(
        descriptor?.sessionId === sessionId
          ? createStatusMessage(descriptor)
          : createSessionMessage(LIVE_DUBBING_ACTIONS.STATUS, sessionId, providerId),
      );
      return response || null;
    } catch {
      return null;
    }
  }

  async _reconcileLease(lease, stale) {
    const sessionId = lease.leaseId;
    // Lease identity is owner + leaseId only. Offscreen status fencing still
    // uses the fixed Live Dubbing provider; no provider metadata lives on leases.
    const providerId = LIVE_DUBBING_PROVIDER_ID;
    const status = await this._queryStatus(null, sessionId, providerId);
    if (!status || status.sessionId !== sessionId || status.success === false
      || this._isSessionMismatch(status, sessionId, providerId)) return false;
    if (!stale && !this._isExplicitlyInactive(status, providerId)) return true;

    const cleanup = await this._disposeAndRelease(
      { sessionId, providerId },
      { releaseLease: true },
    );
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
      providerDiagnostic: null,
    });
  }

  _markTerminalState(state) {
    if (!state?.descriptor?.sessionId) return;
    state.terminalRequested = true;
    this.bootstrapRequestSessions.delete(state.descriptor.sessionId);
  }

  _latchProviderDiagnostic(state, diagnostic) {
    if (!state || state.providerDiagnostic) return state?.providerDiagnostic || null;
    const sanitized = sanitizeLiveDubbingProviderDiagnostic(diagnostic);
    if (sanitized) state.providerDiagnostic = sanitized;
    return state.providerDiagnostic || null;
  }

  _forgetSessionState(sessionId, expectedState = null) {
    if (expectedState && this.sessionStates.get(sessionId) !== expectedState) return;
    this.sessionStates.delete(sessionId);
    this.bootstrapRequestSessions.delete(sessionId);
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

  _isSessionMismatch(response, sessionId, providerId) {
    return Boolean(response && (
      response.sessionId !== sessionId
      || response.providerId !== providerId
      || (Object.prototype.hasOwnProperty.call(response, 'requestedSessionId')
        && response.requestedSessionId !== sessionId)
      || (Object.prototype.hasOwnProperty.call(response, 'actualSessionId')
        && response.actualSessionId !== sessionId)
      || (Object.prototype.hasOwnProperty.call(response, 'requestedProviderId')
        && response.requestedProviderId !== providerId)
      || (Object.prototype.hasOwnProperty.call(response, 'actualProviderId')
        && response.actualProviderId !== providerId)
    ));
  }

  _isExactSessionStatus(response, sessionId, providerId) {
    return Boolean(response
      && response.success !== false
      && isExactSessionResponse(response, sessionId, providerId)
      && typeof response.status === 'string');
  }

  _isSameDescriptorFence(left, right) {
    return Boolean(left && right
      && left.sessionId === right.sessionId
      && left.providerId === right.providerId
      && left.tabId === right.tabId
      && left.startedAt === right.startedAt
      && left.targetLanguage === right.targetLanguage
      && left.eventSequence === right.eventSequence
      && left.status === right.status);
  }

  _isRecoverableRunningStatus(response, sessionId, providerId) {
    return this._isExactSessionStatus(response, sessionId, providerId)
      && response.status === LIVE_DUBBING_STATUS.RUNNING
      && response.active === true
      && response.captureReady === true
      && response.inputPipelineReady === true
      && response.outputPipelineReady === true
      && response.setupComplete === true;
  }

  _isProvablyAbsent(response, sessionId, providerId) {
    return this._isExactSessionStatus(response, sessionId, providerId)
      && (['IDLE', 'DISPOSED', 'MISSING'].includes(response.status)
        || response.disposed === true);
  }

  _isExplicitlyInactive(response, providerId) {
    return Boolean(this._isExactSessionStatus(response, response?.sessionId, providerId)
      && (response.active === false
        || ['IDLE', 'DISPOSED', 'MISSING'].includes(response.status)
        || response.disposed === true));
  }

  _advance(descriptor, status, lastError = null, eventSequence = descriptor.eventSequence + 1) {
    return {
      ...descriptor,
      status,
      lastError,
      eventSequence,
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

  async _writeDescriptor(descriptor, expectedSessionId = null, expectedDescriptor = null) {
    if (expectedSessionId) {
      const current = await this._readDescriptor();
      if (this._storageReadFailed()) return false;
      if (!current || current.sessionId !== expectedSessionId) return false;
    }
    if (this._storageReadFailed()) return false;

    const sanitized = sanitizeDescriptor(descriptor);
    if (!sanitized) throw new TypeError('Invalid live dubbing descriptor');

    if (expectedDescriptor && (!this.descriptor
      || this.descriptor.sessionId !== expectedDescriptor.sessionId
      || this.descriptor.providerId !== expectedDescriptor.providerId
      || this.descriptor.eventSequence !== expectedDescriptor.eventSequence
      || this.descriptor.status !== expectedDescriptor.status)) {
      return false;
    }

    if (expectedSessionId && (!this.descriptor
      || this.descriptor.sessionId !== expectedSessionId
      || this.descriptor.providerId !== sanitized.providerId
      || this.descriptor.eventSequence > sanitized.eventSequence
      || (this.descriptor.eventSequence === sanitized.eventSequence
        && this.descriptor.status !== sanitized.status)
      || (this.descriptor.status === LIVE_DUBBING_STATUS.STOPPING
        && this.descriptor.status !== sanitized.status
        && expectedDescriptor?.status !== LIVE_DUBBING_STATUS.STOPPING))) {
      return false;
    }

    const state = expectedSessionId ? this.sessionStates.get(expectedSessionId) : null;
    if (state?.terminalRequested
      && ![LIVE_DUBBING_STATUS.STOPPING, LIVE_DUBBING_STATUS.ERROR].includes(sanitized.status)) {
      return false;
    }

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

    if (expectedSessionId && (!this.descriptor || this.descriptor.sessionId !== expectedSessionId)) {
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH };
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
