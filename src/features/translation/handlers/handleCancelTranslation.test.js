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
  translationRequestTracker: { getTabRequests: getTabRequestsMock, cancelRequest: vi.fn() }
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

describe('handleCancelTranslation', () => {
  let engine

  beforeEach(() => {
    cancelStreamMock.mockReset()
    getTabRequestsMock.mockReset()
    translationRequestTracker.cancelRequest.mockReset()
    translationRequestTracker.cancelRequest.mockReturnValue({ accepted: true, request: { messageId: 'request' } })
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
      expect(engine.cancelTranslation).toHaveBeenCalledWith(id)
      expect(translationRequestTracker.cancelRequest).toHaveBeenCalledWith(id, 'Translation cancelled by user')
      expect(dispatchCancellationMock).toHaveBeenCalledWith({ messageId: id, request: { messageId: 'request' } })
      expect(cancelStreamMock).toHaveBeenCalledWith(id, 'Translation cancelled by user')
      expect(rateLimitCancelMock).toHaveBeenCalledWith(id)
      expect(queueCancelMock).toHaveBeenCalledWith(id)
    }
  })

  it('selects only matching context IDs for no-tab cancellation', async () => {
    engine.getActiveTranslationIds.mockImplementation((context) => context === 'popup' ? ['popup-id'] : [])

    await handleCancelTranslation({ data: { cancelAll: true, context: 'popup' } }, {})

    expect(engine.getActiveTranslationIds).toHaveBeenCalledWith('popup')
    expect(engine.cancelTranslation).toHaveBeenCalledWith('popup-id')
  })

  it('does not notify for a rejected tracker cancellation', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['terminal'])
    translationRequestTracker.cancelRequest.mockReturnValue({ accepted: false, status: 'completed' })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(dispatchCancellationMock).not.toHaveBeenCalled()
    expect(engine.cancelTranslation).toHaveBeenCalledWith('terminal')
  })

  it('continues exact cleanup when cancellation delivery fails', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    dispatchCancellationMock.mockRejectedValueOnce(new Error('delivery failed'))

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(engine.cancelTranslation).toHaveBeenCalledWith('one')
    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'Translation cancelled by user')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
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
    expect(engine.cancelTranslation).toHaveBeenCalledWith('two')
  })

  it('isolates a synchronous queue cleanup failure', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    queueCancelMock.mockImplementationOnce(() => { throw new Error('queue failed') })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'Translation cancelled by user')
    expect(rateLimitCancelMock).toHaveBeenCalledWith('one')
    expect(queueCancelMock).toHaveBeenCalledWith('one')
  })

  it('isolates a synchronous rate-limit cleanup failure', async () => {
    engine.getActiveTranslationIds.mockReturnValue(['one'])
    rateLimitCancelMock.mockImplementationOnce(() => { throw new Error('rate limit failed') })

    await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(cancelStreamMock).toHaveBeenCalledWith('one', 'Translation cancelled by user')
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
    expect(engine.cancelTranslation).toHaveBeenCalledWith('match')
  })

  it('returns successful zero cancellation for an empty no-tab selection', async () => {
    const result = await handleCancelTranslation({ data: { cancelAll: true } }, {})

    expect(result).toMatchObject({ success: true, cancelledCount: 0 })
    expect(cancelStreamMock).not.toHaveBeenCalled()
  })
})
