import { ParentAcceptanceState } from './ParentAcceptanceState.js'

const HandleState = Object.freeze({
  ACTIVE: 'ACTIVE',
  DISPOSED: 'DISPOSED',
})

export const AcceptanceResult = Object.freeze({
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  COMMITTED: 'COMMITTED',
  COMMIT_FAILED: 'COMMIT_FAILED',
  DUPLICATE: 'DUPLICATE',
  CONFLICT: 'CONFLICT',
  UNKNOWN_PARENT: 'UNKNOWN_PARENT',
  INVALID_RESULT: 'INVALID_RESULT',
  STALE: 'STALE',
})

function parentSnapshot(parent) {
  return Object.freeze({
    parentId: parent.parentId,
    sourceOrder: parent.sourceOrder,
    cleanSource: parent.cleanSource,
    cleanResult: parent.cleanResult,
    state: parent.state,
  })
}

export class ConversationAcceptanceHandle {
  #handoff
  #state
  #parents

  constructor(handoff) {
    this.#handoff = handoff
    this.#state = HandleState.ACTIVE
    this.#parents = new Map(handoff.parents.map(parent => [
      parent.parentId,
      { ...parent, cleanResult: null, state: ParentAcceptanceState.PENDING },
    ]))
  }

  acceptParent(parentId, cleanResult) {
    if (this.#state === HandleState.DISPOSED) return AcceptanceResult.STALE
    const parent = this.#parents.get(parentId)
    if (!parent) return AcceptanceResult.UNKNOWN_PARENT
    if (typeof cleanResult !== 'string' || (cleanResult.length === 0 && parent.cleanSource.length > 0)) {
      return AcceptanceResult.INVALID_RESULT
    }
    if (parent.state === ParentAcceptanceState.ACCEPTED || parent.state === ParentAcceptanceState.COMMITTED) {
      return AcceptanceResult.DUPLICATE
    }
    if (parent.state !== ParentAcceptanceState.PENDING) return AcceptanceResult.CONFLICT
    parent.cleanResult = cleanResult
    parent.state = ParentAcceptanceState.ACCEPTED
    return AcceptanceResult.ACCEPTED
  }

  rejectParent(parentId) {
    if (this.#state === HandleState.DISPOSED) return AcceptanceResult.STALE
    const parent = this.#parents.get(parentId)
    if (!parent) return AcceptanceResult.UNKNOWN_PARENT
    if (parent.state === ParentAcceptanceState.REJECTED) return AcceptanceResult.DUPLICATE
    if (parent.state !== ParentAcceptanceState.PENDING) return AcceptanceResult.CONFLICT
    parent.state = ParentAcceptanceState.REJECTED
    return AcceptanceResult.REJECTED
  }

  markCommitted(parentId) {
    if (this.#state === HandleState.DISPOSED) return AcceptanceResult.STALE
    const parent = this.#parents.get(parentId)
    if (!parent) return AcceptanceResult.UNKNOWN_PARENT
    if (parent.state === ParentAcceptanceState.COMMITTED) return AcceptanceResult.DUPLICATE
    if (parent.state !== ParentAcceptanceState.ACCEPTED) return AcceptanceResult.CONFLICT
    parent.state = ParentAcceptanceState.COMMITTED
    return AcceptanceResult.COMMITTED
  }

  markCommitFailed(parentId) {
    if (this.#state === HandleState.DISPOSED) return AcceptanceResult.STALE
    const parent = this.#parents.get(parentId)
    if (!parent) return AcceptanceResult.UNKNOWN_PARENT
    if (parent.state === ParentAcceptanceState.COMMIT_FAILED) return AcceptanceResult.DUPLICATE
    if (parent.state !== ParentAcceptanceState.ACCEPTED) return AcceptanceResult.CONFLICT
    parent.state = ParentAcceptanceState.COMMIT_FAILED
    return AcceptanceResult.COMMIT_FAILED
  }

  discardPending() {
    if (this.#state === HandleState.DISPOSED) return false
    for (const parent of this.#parents.values()) {
      if (parent.state === ParentAcceptanceState.PENDING) parent.state = ParentAcceptanceState.DISCARDED
    }
    return true
  }

  snapshot() {
    return Object.freeze({
      state: this.#state,
      messageId: this.#handoff.messageId,
      sessionId: this.#handoff.sessionId,
      provider: this.#handoff.provider,
      mode: this.#handoff.mode,
      parents: Object.freeze([...this.#parents.values()].map(parentSnapshot)),
    })
  }

  dispose() {
    if (this.#state === HandleState.DISPOSED) return false
    this.#state = HandleState.DISPOSED
    return true
  }
}
