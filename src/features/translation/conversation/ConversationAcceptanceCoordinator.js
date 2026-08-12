import { translationSessionManager } from '@/features/translation/core/TranslationSessionManager.js'
import { AcceptanceResult } from './ConversationAcceptanceHandle.js'

export class ConversationAcceptanceCoordinator {
  #handles

  constructor() {
    this.#handles = new Map()
  }

  register(messageId, handle) {
    if (this.#handles.has(messageId)) return false
    this.#handles.set(messageId, handle)
    return true
  }

  lookup(messageId) {
    return this.#handles.get(messageId) || null
  }

  remove(messageId) {
    return this.#handles.delete(messageId)
  }

  async acknowledge(messageId, parentId, accepted, cleanResult) {
    const handle = this.#handles.get(messageId)
    if (!handle) return { status: AcceptanceResult.STALE, committed: [] }

    const status = accepted === false
      ? handle.rejectParent(parentId)
      : handle.acceptParent(parentId, cleanResult)
    if (status !== AcceptanceResult.ACCEPTED && status !== AcceptanceResult.REJECTED) {
      return { status, committed: [] }
    }

    const committed = await this.#commitContiguous(handle)
    if (this.#isTerminal(handle)) this.#handles.delete(messageId)
    return { status, committed }
  }

  async #commitContiguous(handle) {
    const snapshot = handle.snapshot()
    const committed = []
    for (const parent of [...snapshot.parents].sort((left, right) => left.sourceOrder - right.sourceOrder)) {
      if (parent.state === 'REJECTED' || parent.state === 'COMMITTED' || parent.state === 'COMMIT_FAILED') continue
      if (parent.state !== 'ACCEPTED') break

      try {
        translationSessionManager.commitAcceptedParent({
          sessionId: snapshot.sessionId,
          provider: snapshot.provider,
          cleanSource: parent.cleanSource,
          cleanResult: parent.cleanResult,
        })
        handle.markCommitted(parent.parentId)
        committed.push(parent.parentId)
      } catch {
        handle.markCommitFailed(parent.parentId)
        break
      }
    }
    return committed
  }

  #isTerminal(handle) {
    return handle.snapshot().parents.every(parent => (
      parent.state === 'REJECTED' || parent.state === 'COMMITTED' || parent.state === 'COMMIT_FAILED'
    ))
  }
}
