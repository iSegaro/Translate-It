/**
 * Synchronous identity registry for Coordinator-owned live-dubbing state.
 * Collection ownership stays here; lifecycle policy and state mutation stay in
 * the Coordinator.
 */
export class LiveDubbingSessionRegistry {
  #sessionStates = new Map();

  #pendingStarts = new Set();

  #terminalOperations = new Map();

  #bootstrapRequestSessions = new Set();

  getSessionState(sessionId) {
    return this.#sessionStates.get(sessionId) || null;
  }

  setSessionState(sessionId, state) {
    this.#sessionStates.set(sessionId, state);
  }

  deleteSessionState(sessionId, expectedState) {
    if (!this.#sessionStates.has(sessionId)
      || this.#sessionStates.get(sessionId) !== expectedState) return false;
    return this.#sessionStates.delete(sessionId);
  }

  isSessionState(sessionId, state) {
    return this.#sessionStates.get(sessionId) === state;
  }

  addPendingStart(record) {
    this.#pendingStarts.add(record);
  }

  deletePendingStart(record) {
    return this.#pendingStarts.delete(record);
  }

  listPendingStarts() {
    return [...this.#pendingStarts];
  }

  findPendingStart(sessionId, tabId = null) {
    return this.listPendingStarts().find(record => (
      (sessionId === null || sessionId === undefined || record.sessionId === sessionId)
      && (tabId === null || record.tabId === tabId)
    ));
  }

  listUnresolvedPendingStarts() {
    return this.listPendingStarts().filter(record => record.tabId === null);
  }

  getTerminalOperation(sessionId) {
    return this.#terminalOperations.get(sessionId) || null;
  }

  setTerminalOperation(sessionId, record) {
    this.#terminalOperations.set(sessionId, record);
  }

  deleteTerminalOperation(sessionId, expectedRecord) {
    if (!this.#terminalOperations.has(sessionId)
      || this.#terminalOperations.get(sessionId) !== expectedRecord) return false;
    return this.#terminalOperations.delete(sessionId);
  }

  hasTerminalOperation(sessionId) {
    return this.#terminalOperations.has(sessionId);
  }

  reserveBootstrapSession(sessionId) {
    this.#bootstrapRequestSessions.add(sessionId);
  }

  hasBootstrapSession(sessionId) {
    return this.#bootstrapRequestSessions.has(sessionId);
  }

  releaseBootstrapSession(sessionId) {
    return this.#bootstrapRequestSessions.delete(sessionId);
  }
}
