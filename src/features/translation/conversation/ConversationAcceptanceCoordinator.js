import { translationSessionManager } from '@/features/translation/core/TranslationSessionManager.js'
import { AcceptanceResult } from './ConversationAcceptanceHandle.js'
import { getScopedLogger } from '@/shared/logging/logger.js'
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js'

export const CONVERSATION_ACCEPTANCE_TIMEOUT_MS = 300000
const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'ConversationAcceptanceCoordinator')

export class ConversationAcceptanceCoordinator {
  #handles
  #timers

  constructor() {
    this.#handles = new Map()
    this.#timers = new Map()
  }

  register(messageId, handle) {
    if (this.#handles.has(messageId)) return false
    this.#handles.set(messageId, handle)
    return true
  }

  activate(messageId) {
    if (!this.#handles.has(messageId)) return false
    if (this.#timers.has(messageId)) return true
    this.#timers.set(messageId, setTimeout(() => this.#expire(messageId), CONVERSATION_ACCEPTANCE_TIMEOUT_MS))
    return true
  }

  lookup(messageId) {
    return this.#handles.get(messageId) || null
  }

  remove(messageId) {
    const timer = this.#timers.get(messageId)
    if (timer) clearTimeout(timer)
    this.#timers.delete(messageId)
    const handle = this.#handles.get(messageId)
    if (handle) handle.dispose()
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
    if (this.#isTerminal(handle)) this.remove(messageId)
    return { status, committed }
  }

  #expire(messageId) {
    const handle = this.#handles.get(messageId)
    if (!handle) return
    const snapshot = handle.snapshot()
    const pendingCount = snapshot.parents.filter(parent => (
      parent.state === 'PENDING' || parent.state === 'ACCEPTED'
    )).length
    handle.discardPending()
    logger.debug('[ConversationAcceptanceCoordinator] Acceptance handle expired', {
      messageId: String(messageId).slice(0, 32),
      parentCount: snapshot.parents.length,
      committedCount: snapshot.parents.filter(parent => parent.state === 'COMMITTED').length,
      pendingCount,
      reason: 'ACK_TIMEOUT',
    })
    this.remove(messageId)
  }

  async #commitContiguous(handle) {
    const snapshot = handle.snapshot()
    const committed = []
    for (const parent of [...snapshot.parents].sort((left, right) => left.sourceOrder - right.sourceOrder)) {
      if (parent.state === 'REJECTED' || parent.state === 'DISCARDED' || parent.state === 'COMMITTED' || parent.state === 'COMMIT_FAILED') continue
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
      parent.state === 'REJECTED' || parent.state === 'DISCARDED' || parent.state === 'COMMITTED' || parent.state === 'COMMIT_FAILED'
    ))
  }
}
