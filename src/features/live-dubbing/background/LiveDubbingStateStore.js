import {
  LIVE_DUBBING_OUTCOME_STORAGE_KEY,
  LIVE_DUBBING_OUTCOME_STORAGE_STATE,
  LIVE_DUBBING_STORAGE_KEY,
  LIVE_DUBBING_STORAGE_STATE,
} from '../constants.js';
import {
  cloneDescriptor,
  createLiveDubbingTerminalOutcome,
  sanitizeDescriptor,
  toPublicLiveDubbingTerminalOutcome,
} from '../contracts.js';

export const LIVE_DUBBING_CLEAR_OUTCOMES = Object.freeze({
  CLEARED: 'CLEARED',
  SESSION_MISMATCH: 'SESSION_MISMATCH',
  STORAGE_FAILURE: 'STORAGE_FAILURE',
});

function sanitizeStoredDescriptor(value) {
  return sanitizeDescriptor(value);
}

/**
 * Persistence-owned state for Live Dubbing.
 * Owns descriptor/storageState, terminalOutcome/outcomeStorageState,
 * outcomeMutation serialization, and all browser.storage.session mechanics.
 * No lifecycle policy: terminalRequested, STOPPING regression, and RUNNING
 * clearOutcome semantics are Coordinator-owned. Store performs only
 * persistence-level fencing (expectedSessionId, expectedDescriptor compare,
 * stale eventSequence protection) and atomic descriptor+outcome writes.
 * All descriptor/outcome validation delegates to contracts.js sanitizers.
 */
export class LiveDubbingStateStore {
  constructor(options = {}) {
    this.browserAPI = options.browserAPI || null;
    this.descriptor = null;
    this.storageState = LIVE_DUBBING_STORAGE_STATE.ABSENT;
    this.terminalOutcome = null;
    this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT;
    this.outcomeMutation = Promise.resolve();
  }

  // ---- storage capability checks / failure tracking ----

  isStorageReadFailed() {
    return this.storageState === LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
  }

  isStorageDescriptorInvalid() {
    return this.storageState === LIVE_DUBBING_STORAGE_STATE.PRESENT && !this.descriptor;
  }

  // ---- outcome mutation serialization primitive ----
  // Coordinator awaits this before deciding a RUNNING commit may clear outcome.
  async awaitOutcomeMutations() {
    await this.outcomeMutation;
  }

  // ---- core persistence ----

  async readDescriptor() {
    const storage = this.browserAPI?.storage?.session;
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

  async readStatusSnapshot() {
    const storage = this.browserAPI?.storage?.session;
    if (typeof storage?.get !== 'function') {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.READ_FAILED;
      this.terminalOutcome = null;
      return;
    }

    try {
      const result = await storage.get([
        LIVE_DUBBING_STORAGE_KEY,
        LIVE_DUBBING_OUTCOME_STORAGE_KEY,
      ]);
      const storedDescriptor = result?.[LIVE_DUBBING_STORAGE_KEY];
      if (storedDescriptor === undefined || storedDescriptor === null) {
        this.storageState = LIVE_DUBBING_STORAGE_STATE.ABSENT;
        this.descriptor = null;
      } else {
        this.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
        this.descriptor = sanitizeStoredDescriptor(storedDescriptor);
      }

      const storedOutcome = result?.[LIVE_DUBBING_OUTCOME_STORAGE_KEY];
      if (storedOutcome === undefined || storedOutcome === null) {
        this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT;
        this.terminalOutcome = null;
      } else {
        const outcome = createLiveDubbingTerminalOutcome(storedOutcome);
        if (!outcome) {
          this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.READ_FAILED;
          this.terminalOutcome = null;
        } else {
          this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT;
          this.terminalOutcome = outcome;
        }
      }
    } catch {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.READ_FAILED;
      this.terminalOutcome = null;
    }
  }

  getStatusTerminalOutcome() {
    if (!this.terminalOutcome || (this.descriptor
      && (this.terminalOutcome.sourceSessionId !== this.descriptor.sessionId
        || this.terminalOutcome.providerId !== this.descriptor.providerId))) {
      return null;
    }
    return toPublicLiveDubbingTerminalOutcome(this.terminalOutcome);
  }

  queueOutcomeMutation(operation) {
    const next = this.outcomeMutation.then(operation, operation).catch(() => false);
    this.outcomeMutation = next;
    return next;
  }

  async writeTerminalOutcome(outcome) {
    const sanitized = createLiveDubbingTerminalOutcome(outcome);
    const storage = this.browserAPI?.storage?.session;
    if (!sanitized || typeof storage?.get !== 'function' || typeof storage?.set !== 'function') {
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED;
      return false;
    }

    try {
      // The active descriptor is the lifecycle fence. An old terminal may not
      // write after a newer session has taken ownership.
      const descriptorResult = await storage.get(LIVE_DUBBING_STORAGE_KEY);
      const active = sanitizeStoredDescriptor(descriptorResult?.[LIVE_DUBBING_STORAGE_KEY]);
      if (active && (active.sessionId !== sanitized.sourceSessionId
        || active.providerId !== sanitized.providerId)) {
        this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED;
        return false;
      }

      const outcomeResult = await storage.get(LIVE_DUBBING_OUTCOME_STORAGE_KEY);
      const stored = outcomeResult?.[LIVE_DUBBING_OUTCOME_STORAGE_KEY];
      if (stored !== undefined && stored !== null) {
        const existing = createLiveDubbingTerminalOutcome(stored);
        if (!existing) {
          this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED;
          return false;
        }
        if (existing.sourceSessionId !== sanitized.sourceSessionId) {
          this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED;
          return false;
        }
        this.terminalOutcome = existing;
        this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT;
        return true;
      }

      await storage.set({ [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: sanitized });
      this.terminalOutcome = sanitized;
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.PRESENT;
      return true;
    } catch {
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.WRITE_FAILED;
      return false;
    }
  }

  async writeDescriptor(descriptor, expectedSessionId = null, expectedDescriptor = null, options = {}) {
    const current = await this.readDescriptor();
    if (this.isStorageReadFailed()) return false;
    return this._writeDescriptorWithCurrent(descriptor, current, expectedDescriptor, expectedSessionId, options);
  }

  async writeDescriptorFromCurrent(descriptor, current, expectedSessionId = null, expectedDescriptor = null, options = {}) {
    if (this.isStorageReadFailed()) return false;
    return this._writeDescriptorWithCurrent(descriptor, current, expectedDescriptor, expectedSessionId, options);
  }

  async _writeDescriptorWithCurrent(descriptor, current, expectedDescriptor, expectedSessionId, options = {}) {
    const sanitized = sanitizeDescriptor(descriptor);
    if (!sanitized) throw new TypeError('Invalid live dubbing descriptor');

    if (expectedDescriptor && (!current
      || current.sessionId !== expectedDescriptor.sessionId
      || current.providerId !== expectedDescriptor.providerId
      || current.eventSequence !== expectedDescriptor.eventSequence
      || current.status !== expectedDescriptor.status)) {
      return false;
    }

    // Pure persistence fences: session/provider identity and stale eventSequence.
    // STOPPING lifecycle guard is Coordinator-owned and intentionally not here.
    if (expectedSessionId && (!current
      || current.sessionId !== expectedSessionId
      || current.providerId !== sanitized.providerId
      || current.eventSequence > sanitized.eventSequence
      || (current.eventSequence === sanitized.eventSequence
        && current.status !== sanitized.status))) {
      return false;
    }

    const storage = this.browserAPI?.storage?.session;
    if (typeof storage?.set !== 'function') {
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      return false;
    }

    const previousDescriptor = this.descriptor;
    // Coordinator decides when outcome clearing is appropriate (successful RUNNING commit).
    // Store performs only the atomic persistence: descriptor + null outcome in one set.
    const clearOutcome = options.clearOutcome === true;
    try {
      await storage.set({
        [LIVE_DUBBING_STORAGE_KEY]: cloneDescriptor(sanitized),
        ...(clearOutcome ? { [LIVE_DUBBING_OUTCOME_STORAGE_KEY]: null } : {}),
      });
    } catch {
      // Keep last known descriptor; a failed write cannot establish ownership.
      this.storageState = LIVE_DUBBING_STORAGE_STATE.UNREADABLE;
      this.descriptor = previousDescriptor;
      return false;
    }

    this.descriptor = sanitized;
    this.storageState = LIVE_DUBBING_STORAGE_STATE.PRESENT;
    if (clearOutcome) {
      this.terminalOutcome = null;
      this.outcomeStorageState = LIVE_DUBBING_OUTCOME_STORAGE_STATE.ABSENT;
    }
    return true;
  }

  async clearDescriptor(expectedSessionId = null) {
    if (expectedSessionId) {
      const current = await this.readDescriptor();
      if (this.isStorageReadFailed()) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
      }
      if (this.isStorageDescriptorInvalid()) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
      }
      if (!current || current.sessionId !== expectedSessionId) {
        return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH };
      }
    }
    if (this.isStorageReadFailed() || this.isStorageDescriptorInvalid()) {
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.STORAGE_FAILURE };
    }

    if (expectedSessionId && (!this.descriptor || this.descriptor.sessionId !== expectedSessionId)) {
      return { outcome: LIVE_DUBBING_CLEAR_OUTCOMES.SESSION_MISMATCH };
    }

    const storage = this.browserAPI?.storage?.session;
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
}
