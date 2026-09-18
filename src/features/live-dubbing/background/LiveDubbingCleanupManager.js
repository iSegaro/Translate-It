import { LIVE_DUBBING_OWNER } from '../constants.js';
import { createDisposeMessage, isAcknowledgedForSession } from '../contracts.js';

export const CLEANUP_LEASE_STATES = Object.freeze({
  PENDING: 'PENDING',
  ACQUIRED: 'ACQUIRED',
  ABSENT: 'ABSENT',
});

/**
 * Physical cleanup/resource-release subsystem for Live Dubbing.
 * Owns single-flight, per-session facts, offscreen DISPOSE, ack validation,
 * proven-absence lease release, pending lease settlement, and exactly-once
 * release with stale fencing.
 *
 * Facts are manager-owned and carry exact captured state identity:
 * {sessionId, providerId, state, leaseState, leaseSettlementPromise,
 *  disposeAcknowledged, releasePromise, completed}
 * No mutation of state.cleanupFacts.
 */
export class LiveDubbingCleanupManager {
  constructor(options = {}) {
    this.leaseManager = options.leaseManager || null;
    this.sendOffscreen = options.sendOffscreen || null;
    this.getSessionState = typeof options.getSessionState === 'function'
      ? options.getSessionState
      : () => null;
    this.logger = options.logger || { warn: () => {} };
    this._facts = new Map();
    this._promises = new Map();
  }

  disposeAndRelease(descriptor, options = {}) {
    return this._startCleanup(
      descriptor,
      options,
      (currentDescriptor, facts) => this._disposeAndReleaseOnce(currentDescriptor, facts),
    );
  }

  /**
   * Release an exact lease after the Coordinator has positively proved that
   * the offscreen runtime is absent. This path deliberately skips DISPOSE;
   * ordinary cleanup must continue to receive an exact DISPOSED acknowledgement.
   */
  releaseAfterProvenAbsence(descriptor, options = {}) {
    return this._startCleanup(
      descriptor,
      options,
      (currentDescriptor, facts) => this._releaseAfterProvenAbsenceOnce(currentDescriptor, facts),
    );
  }

  _startCleanup(descriptor, options, operation) {
    const { facts } = this._getOrCreateFacts(descriptor, options);
    const existing = this._promises.get(descriptor.sessionId);
    if (
      existing
      && existing.providerId === descriptor.providerId
      && existing.facts === facts
    ) {
      return existing.promise;
    }

    const record = {
      sessionId: descriptor.sessionId,
      providerId: descriptor.providerId,
      facts,
      promise: null,
    };
    const cleanup = operation(descriptor, facts);
    record.promise = cleanup;
    this._promises.set(descriptor.sessionId, record);
    cleanup.then(
      () => {
        if (this._promises.get(descriptor.sessionId) === record) {
          this._promises.delete(descriptor.sessionId);
        }
      },
      () => {
        if (this._promises.get(descriptor.sessionId) === record) {
          this._promises.delete(descriptor.sessionId);
        }
      },
    );
    return cleanup;
  }

  getAttempt(sessionId) {
    return this._promises.get(sessionId) || null;
  }

  abandonAttempt(sessionId, expectedAttempt) {
    if (this._promises.get(sessionId) === expectedAttempt) {
      this._promises.delete(sessionId);
    }
  }

  forgetSession(sessionId, expectedState = null) {
    const facts = this._facts.get(sessionId);
    if (!facts) return;
    const current = this.getSessionState(sessionId);
    if (expectedState !== null && expectedState !== undefined) {
      if (current !== expectedState) return;
      if (facts.state !== expectedState) return;
      this._facts.delete(sessionId);
      return;
    }
    // Stateless stale: only removable when no live state
    if (current) return;
    this._facts.delete(sessionId);
  }

  hasCleanupFacts(sessionId) {
    return this._facts.has(sessionId);
  }

  syncLeaseOwnership(sessionId, expectedState, leaseAcquired) {
    const facts = this._facts.get(sessionId);
    if (!facts) return;
    if (facts.state !== expectedState) return;
    if (this.getSessionState(sessionId) !== expectedState) return;
    if (facts.leaseState === CLEANUP_LEASE_STATES.PENDING) return;
    facts.leaseState = leaseAcquired ? CLEANUP_LEASE_STATES.ACQUIRED : CLEANUP_LEASE_STATES.ABSENT;
  }

  _releaseAfterProvenAbsenceOnce(descriptor, facts) {
    this._trackLeaseSettlement(facts);
    return this._finalizeRelease(descriptor, facts);
  }

  async _disposeAndReleaseOnce(descriptor, facts) {
    const capturedFacts = facts;
    this._trackLeaseSettlement(capturedFacts);

    try {
      const response = await this.sendOffscreen(createDisposeMessage(descriptor));
      if (
        response?.ack !== 'DISPOSED'
        || !isAcknowledgedForSession(response, 'DISPOSED', descriptor.sessionId, descriptor.providerId)
        || response.ignored === true
        || !this._isCurrentCleanup(capturedFacts)
      ) {
        return { success: false };
      }

      capturedFacts.disposeAcknowledged = true;
      return this._finalizeCleanup(descriptor, capturedFacts);
    } catch {
      this.logger.warn('Live dubbing disposal did not complete');
      return { success: false };
    }
  }

  _getOrCreateFacts(descriptor, options = {}) {
    const sessionId = descriptor.sessionId;
    const providerId = descriptor.providerId;
    const state = this.getSessionState(sessionId) || null;
    let facts = this._facts.get(sessionId) || null;
    if (facts && (facts.providerId !== providerId || facts.state !== state)) {
      facts = null;
    }
    if (!facts) {
      facts = {
        sessionId,
        providerId,
        state,
        leaseState: CLEANUP_LEASE_STATES.ABSENT,
        leaseSettlementPromise: null,
        disposeAcknowledged: false,
        releasePromise: null,
        completed: false,
      };
      this._facts.set(sessionId, facts);
    }

    if (options.releaseLease === true) {
      facts.leaseState = CLEANUP_LEASE_STATES.ACQUIRED;
    } else if (
      options.releaseLease === false
      && !(state?.leasePromise && !state.leaseAcquired)
    ) {
      facts.leaseState = CLEANUP_LEASE_STATES.ABSENT;
    } else if (facts.leaseState === CLEANUP_LEASE_STATES.ABSENT) {
      facts.leaseState = state?.leasePromise && !state.leaseAcquired
        ? CLEANUP_LEASE_STATES.PENDING
        : state?.leaseAcquired
          ? CLEANUP_LEASE_STATES.ACQUIRED
          : CLEANUP_LEASE_STATES.ABSENT;
    }

    return { state, facts };
  }

  _trackLeaseSettlement(facts) {
    const state = facts.state;
    if (
      facts.leaseState !== CLEANUP_LEASE_STATES.PENDING
      || facts.leaseSettlementPromise
      || !state?.leasePromise
    ) return;

    const settlement = Promise.resolve(state.leasePromise).then(
      acquired => {
        if (!this._isCurrentCleanup(facts)) return false;
        state.leaseAcquired = acquired === true;
        facts.leaseState = acquired === true
          ? CLEANUP_LEASE_STATES.ACQUIRED
          : CLEANUP_LEASE_STATES.ABSENT;
        return acquired === true;
      },
      () => {
        if (!this._isCurrentCleanup(facts)) return false;
        facts.leaseState = CLEANUP_LEASE_STATES.ABSENT;
        return false;
      },
    );
    facts.leaseSettlementPromise = settlement;
    settlement.then(() => {
      if (facts.leaseSettlementPromise === settlement) facts.leaseSettlementPromise = null;
    });
  }

  _isCurrentCleanup(facts) {
    if (this._facts.get(facts.sessionId) !== facts) return false;
    const current = this.getSessionState(facts.sessionId);
    return facts.state ? current === facts.state : !current;
  }

  _finalizeCleanup(descriptor, facts) {
    if (!this._isCurrentCleanup(facts) || !facts.disposeAcknowledged) {
      return Promise.resolve({ success: false });
    }
    return this._finalizeRelease(descriptor, facts);
  }

  _finalizeRelease(descriptor, facts) {
    if (!this._isCurrentCleanup(facts)) return Promise.resolve({ success: false });
    if (facts.completed) return Promise.resolve({ success: true });
    if (facts.leaseState === CLEANUP_LEASE_STATES.PENDING) {
      return facts.leaseSettlementPromise
        ? facts.leaseSettlementPromise.then(() => this._finalizeRelease(descriptor, facts))
        : Promise.resolve({ success: false });
    }
    if (facts.leaseState === CLEANUP_LEASE_STATES.ABSENT) {
      facts.completed = true;
      if (facts.state) facts.state.cleanupCompleted = true;
      return Promise.resolve({ success: true });
    }

    const release = this._releaseCleanupLease(descriptor, facts);
    return release.then(success => {
      if (!success || !this._isCurrentCleanup(facts)) return { success: false };
      facts.completed = true;
      if (facts.state) facts.state.cleanupCompleted = true;
      return { success: true };
    });
  }

  _releaseCleanupLease(descriptor, facts) {
    if (facts.releasePromise) return facts.releasePromise;
    if (!this._isCurrentCleanup(facts)) return Promise.resolve(false);

    const release = Promise.resolve()
      .then(() => this.leaseManager.release({
        owner: LIVE_DUBBING_OWNER,
        leaseId: descriptor.sessionId,
      }))
      .then(result => result !== false)
      .catch(() => false);
    facts.releasePromise = release;
    release.then(success => {
      if (!success && facts.releasePromise === release) facts.releasePromise = null;
    });
    return release;
  }
}
