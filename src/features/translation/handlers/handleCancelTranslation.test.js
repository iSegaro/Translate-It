import { beforeEach, describe, expect, it, vi } from 'vitest'

const cancelStreamMock = vi.fn()
const getTabRequestsMock = vi.fn()
const queueCancelMock = vi.fn()
const rateLimitCancelMock = vi.fn()

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))

vi.mock('../core/StreamingManager.js', () => ({
  streamingManager: { cancelStream: cancelStreamMock }
}))

vi.mock('@/core/services/translation/TranslationRequestTracker.js', () => ({
  translationRequestTracker: { getTabRequests: getTabRequestsMock, getRequest: vi.fn(), cancelRequest: vi.fn(), markTimeout: vi.fn() }
}))

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: { cancelRequest: vi.fn(), handleTimeout: vi.fn() }
}))

const dispatchCancellationMock = vi.fn()
vi.mock('@/core/services/translation/UnifiedResultDispatcher.js', () => ({
  dispatchTranslationCancellation: dispatchCancellationMock
}))

vi.mock('../core/QueueManager.js', () => ({
  queueManager: { cancelByMessageId: queueCancelMock }
}))

vi.mock('../core/RateLimitManager.js', () => ({
  rateLimitManager: { clearPendingRequests: rateLimitCancelMock }
}))

const { handleCancelTranslation } = await import('./handleCancelTranslation.js')
const { translationRequestTracker } = await import('@/core/services/translation/TranslationRequestTracker.js')
const { unifiedTranslationService } = await import('@/core/services/translation/UnifiedTranslationService.js')

describe('handleCancelTranslation', () => {
  let engine

  beforeEach(() => {
    cancelStreamMock.mockReset()
    getTabRequestsMock.mockReset()
    translationRequestTracker.cancelRequest.mockReset()
    translationRequestTracker.cancelRequest.mockReturnValue({ accepted: true, request: { messageId: 'request' } })
    translationRequestTracker.markTimeout.mockReset()
    translationRequestTracker.markTimeout.mockReturnValue({ accepted: true, request: { messageId: 'request' } })
    unifiedTranslationService.cancelRequest.mockReset()
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: false, success: false })
    unifiedTranslationService.handleTimeout.mockReset()
    unifiedTranslationService.handleTimeout.mockResolvedValue({ handled: true, success: true })
    dispatchCancellationMock.mockReset()
    queueCancelMock.mockReset()
    rateLimitCancelMock.mockReset()
    engine = {
      getActiveTranslationIds: vi.fn(() => []),
      cancelTranslation: vi.fn().mockResolvedValue(true)
    }
    globalThis.backgroundService = { translationEngine: engine }
  })

  it('performs complete exact-ID cleanup for no-tab global cancellation', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one', 'two'])

    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 2 })
    for (const id of ['one', 'two']) {
      expect(engine.cancelTranslation).toHaveBeenCalledWith(id, false, undefined, 'user_cancelled')
      expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith(id, 'user_cancelled')
      expect(dispatchCancellationMock).toHaveBeenCalledWith({ messageId: id, request: { messageId: 'request' } })
      expect(cancelStreamMock).toHaveBeenCalledWith(id, 'user_cancelled')
      expect(rateLimitCancelMock).toHaveBeenCalledWith(id)
      expect(queueCancelMock).toHaveBeenCalledWith(id)
    }
  })

  it('selects only matching context IDs for no-tab cancellation', async () => {
    engine.getActiveTranslationIds.mockImplementation((context) => context === 'popup' ? ['popup-id'] : [])

    await handleCancelTranslation({ data: { cancelAll: true, context: 'popup' } }, {})

    expect(engine.getActiveTranslationIds).toHaveBeenCalledWith('popup')
    expect(engine.cancelTranslation).toHaveBeenCalledWith('popup-id', false, undefined, 'user_cancelled')
  })

  it('does not notify for a rejected tracker cancellation', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['terminal'])
    translationRequestTracker.cancelRequest.mockReturnValue({ accepted: false, status: 'completed' })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(dispatchCancellationMock).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).toHaveBeenCalledWith('terminal', false, undefined, 'user_cancelled')
  })

  it('delegates active timeout lifecycle before exact-ID cleanup', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['timed-out'])

    await handleCancelTranslation({ data: { cancelAll: true, timeout: true } }, {})

    expect(unifiedTranslationService.handleTimeout).toHaveBeenCalledWith('timed-out', 'Translation timed out', undefined)
    expect(translationRequestTracker.markTimeout).not.toHaveBeenCalled()
    expect(translationRequestTracker.cancelRequest).not.toHaveBeenCalled()
    expect(dispatchCancellationMock).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).not.toHaveBeenCalledWith('timed-out')
    expect(cancelStreamMock).toHaveBeenCalledWith('timed-out', 'Translation timed out')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('timed-out')
    expect(queueCancelMock).toHaveBeenCalledWith('timed-out')
  })

  it('keeps stream, rate-limit, and queue cleanup after timeout delegation', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['timed-out'])

    await handleCancelTranslation({ data: { cancelAll: true, timeout: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledWith('timed-out', 'Translation timed out')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('timed-out')
    expect(queueCancelMock).toHaveBeenCalledWith('timed-out')
  })

  it('forwards a timeout reason without a subtype and keeps exact-ID cleanup', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['timed-out'])

    await handleCancelTranslation({
      data: {
        cancelAll: true,
        timeout: true,
        reason: 'Streaming translation timed out'
      }
    }, {})

    expect(unifiedTranslationService.handleTimeout).toHaveBeenCalledWith(
      'timed-out',
      'Streaming translation timed out',
      undefined
    )
    expect(cancelStreamMock).toHaveBeenCalledWith('timed-out', 'Streaming translation timed out')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('timed-out')
    expect(queueCancelMock).toHaveBeenCalledWith('timed-out')
  })

  it('uses timeout-aware engine and stream fallback when service reports unhandled', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['legacy-timeout'])
    unifiedTranslationService.handleTimeout.mockResolvedValue({ handled: false, success: false })

    const result = await handleCancelTranslation({
      data: {
        cancelAll: true,
        timeout: true,
        timeoutType: 'PROGRESS_TIMEOUT',
        reason: 'No progress'
      }
    }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 1 })
    expect(engine.cancelTranslation).toHaveBeenCalledWith(
      'legacy-timeout',
      true,
      'PROGRESS_TIMEOUT',
      'No progress'
    )
    expect(cancelStreamMock).toHaveBeenCalledWith(
      'legacy-timeout',
      'No progress',
      true,
      'PROGRESS_TIMEOUT'
    )
    expect(translationRequestTracker.markTimeout).not.toHaveBeenCalled()
    expect(translationRequestTracker.cancelRequest).not.toHaveBeenCalled()
    expect(dispatchCancellationMock).not.toHaveBeenCalled()
  })

  it.each(['completed', 'cancelled'])('skips duplicate timeout cleanup after %s terminal state', async (status) => {
    engine.getActiveTranslationIds.mockReturnValue(['terminal'])
    unifiedTranslationService.handleTimeout.mockResolvedValue({ handled: true, success: false, error: status })

    const result = await handleCancelTranslation({ data: { cancelAll: true, timeout: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 0 })
    expect(engine.cancelTranslation).not.toHaveBeenCalled()
    expect(cancelStreamMock).not.toHaveBeenCalled()
    expect(rateLimitCancelMock).not.toHaveBeenCalled()
    expect(queueCancelMock).not.toHaveBeenCalled()
  })

  it('continues exact cleanup when cancellation delivery fails', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    dispatchCancellationMock.mockRejectedValueOnce(new Error('delivery failed'))

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(engine.cancelTranslation).toHaveBeenCalledWith('one', false, undefined, 'user_cancelled')
    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'user_cancelled')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
  })

  it('preserves internal lifecycle reason when falling back to engine cancellation', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['replaced'])

    await handleCancelTranslation({
      data: { cancelAll: true, reason: 'document-replaced' }
    }, {})

    expect(engine.cancelTranslation).toHaveBeenCalledWith(
      'replaced',
      false,
      undefined,
      'document-replaced'
    )
    expect(cancelStreamMock).toHaveBeenCalledWith('replaced', 'document-replaced')
  })

  it('continues remaining cleanup when one engine cancellation rejects', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one', 'two'])
    engine.cancelTranslation.mockRejectedValueOnce(new Error('abort failed'))

    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 1 })
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('two')
  })

  it('isolates a synchronous stream cancellation failure from all cleanup', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one', 'two'])
    cancelStreamMock.mockImplementationOnce(() => { throw new Error('stream failed') })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
    expect(engine.cancelTranslation).toHaveBeenCalledWith('two', false, undefined, 'user_cancelled')
  })

  it('isolates a synchronous queue cleanup failure', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    queueCancelMock.mockImplementationOnce(() => { throw new Error('queue failed') })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'user_cancelled')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
  })

  it('isolates a synchronous rate-limit cleanup failure', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    rateLimitCancelMock.mockImplementationOnce(() => { throw new Error('rate limit failed') })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'user_cancelled')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
  })

  it('preserves sender-tab context and session filtering', async () => {
    getTabRequestsMock.mockReturnValue([
      { messageId: 'match', context: 'page', data: { sessionId: 'session-a' } },
      { messageId: 'wrong-context', context: 'popup', data: { sessionId: 'session-a' } },
      { messageId: 'wrong-session', context: 'page', data: { sessionId: 'session-b' } }
    ])

    await handleCancelTranslation(
      { data: { cancelAll: true, context: 'page', sessionId: 'session-a' } },
      { tab: { id: 7 } }
    )

    expect(engine.getActiveTranslationIds).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).toHaveBeenCalledTimes(1)
    expect(engine.cancelTranslation).toHaveBeenCalledWith('match', false, undefined, 'user_cancelled')
  })

  it('returns successful zero cancellation for an empty no-tab selection', async () => {
    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 0 })
    expect(cancelStreamMock).not.toHaveBeenCalled()
  })

  it('delegates a service-owned user cancellation exactly once', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['owned'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: true, success: true })

    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 1 })
    expect(unifiedTranslationService.cancelRequest).toHaveBeenCalledTimes(1)
    expect(unifiedTranslationService.cancelRequest).toHaveBeenCalledWith('owned', 'user_cancelled')
  })

  it('does not repeat tracker transition, dispatch or engine abort on delegated success', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['owned'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: true, success: true })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(translationRequestTracker.cancelRequest).not.toHaveBeenCalled()
    expect(dispatchCancellationMock).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).not.toHaveBeenCalled()
  })

  it('runs the legacy fallback when the service reports unhandled', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['legacy'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: false, success: false })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith('legacy', 'user_cancelled')
    expect(dispatchCancellationMock).toHaveBeenCalledWith({ messageId: 'legacy', request: { messageId: 'request' } })
    expect(engine.cancelTranslation).toHaveBeenCalledWith('legacy', false, undefined, 'user_cancelled')
  })

  it('delegates timeout through the service timeout API only', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['timed-out'])

    await handleCancelTranslation({ data: { cancelAll: true, timeout: true } }, {})

    expect(unifiedTranslationService.cancelRequest).not.toHaveBeenCalled()
    expect(unifiedTranslationService.handleTimeout).toHaveBeenCalledWith('timed-out', 'Translation timed out', undefined)
    expect(translationRequestTracker.markTimeout).not.toHaveBeenCalled()
    expect(translationRequestTracker.cancelRequest).not.toHaveBeenCalled()
  })

  it('preserves abort-always without touching tracker or dispatch when handled-but-rejected', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['terminal'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: true, success: false, error: 'already_terminal' })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(translationRequestTracker.cancelRequest).not.toHaveBeenCalled()
    expect(dispatchCancellationMock).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).toHaveBeenCalledWith('terminal', false, undefined, 'user_cancelled')
  })

  it('safely falls back when the delegate rejects', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['fallback'])
    unifiedTranslationService.cancelRequest.mockRejectedValue(new Error('service failure'))

    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true })
    expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith('fallback', 'user_cancelled')
    expect(engine.cancelTranslation).toHaveBeenCalledWith('fallback', false, undefined, 'user_cancelled')
  })

  it('supports mixed delegated and fallback IDs for cancelAll', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['owned', 'fallback'])
    unifiedTranslationService.cancelRequest.mockImplementation((id) =>
      id === 'owned'
        ? Promise.resolve({ handled: true, success: true })
        : Promise.resolve({ handled: false, success: false })
    )

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(unifiedTranslationService.cancelRequest).toHaveBeenCalledTimes(2)
    expect(translationRequestTracker.cancelRequest).toHaveBeenCalledTimes(1)
    expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith('fallback', 'user_cancelled')
  })

  it('runs streaming, rate-limit and queue cleanup exactly once per target', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['owned'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: true, success: true })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledTimes(1)
    expect(rateLimitCancelMock).toHaveBeenCalledTimes(1)
    expect(queueCancelMock).toHaveBeenCalledTimes(1)
    expect(cancelStreamMock).toHaveBeenCalledWith('owned', 'user_cancelled')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('owned')
    expect(queueCancelMock).toHaveBeenCalledWith('owned')
  })

  it('preserves the acknowledgment shape for delegated cancellations', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['owned'])
    unifiedTranslationService.cancelRequest.mockResolvedValue({ handled: true, success: true })

    const result = await handleCancelTranslation({ data: { cancelAll: true, reason: 'Test cancel' } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 1, reason: 'Test cancel', context: 'background', message: 'Translation cancellation acknowledged' })
    expect(unifiedTranslationService.cancelRequest).toHaveBeenCalledWith('owned', 'Test cancel')
  })
})
