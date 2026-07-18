import { beforeEach, describe, expect, it, vi } from 'vitest'

const getRequestMock = vi.fn()
const completeRequestMock = vi.fn()
const dispatchResultMock = vi.fn()

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() })
}))
vi.mock('@/shared/config/config.js', () => ({ TranslationMode: { Select_Element: 'select-element', LEGACY_FIELD: 'legacy-field', Field: 'field' } }))
vi.mock('@/shared/messaging/core/MessageActions.js', () => ({ MessageActions: { TRANSLATION_RESULT_UPDATE: 'TRANSLATION_RESULT_UPDATE' } }))
vi.mock('webextension-polyfill', () => ({ default: { tabs: { query: vi.fn(), sendMessage: vi.fn() } } }))
vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    translationEngine: {},
    requestTracker: { getRequest: getRequestMock, completeRequest: completeRequestMock },
    resultDispatcher: { dispatchResult: dispatchResultMock },
    handleStreamingUpdate: vi.fn()
  }
}))
vi.mock('@/core/extensionContext.js', () => ({ default: { isContextError: vi.fn(), handleContextError: vi.fn() } }))

const { handleTranslationResult } = await import('./handleTranslationResult.js')

describe('handleTranslationResult terminal suppression', () => {
  beforeEach(() => {
    getRequestMock.mockReset()
    completeRequestMock.mockReset()
    dispatchResultMock.mockReset()
  })

  it('suppresses a late timeout result without dispatching it', async () => {
    getRequestMock.mockReturnValue({ messageId: 'm-timeout' })
    completeRequestMock.mockReturnValue({ accepted: false, status: 'timeout', reason: 'already_terminal' })

    const result = await handleTranslationResult({ messageId: 'm-timeout', data: { success: true } })

    expect(result).toMatchObject({ success: true, handled: true, suppressed: true, status: 'timeout' })
    expect(dispatchResultMock).not.toHaveBeenCalled()
  })

  it('suppresses a cancelled result without relabelling its terminal state', async () => {
    getRequestMock.mockReturnValue({ messageId: 'm-cancelled' })
    completeRequestMock.mockReturnValue({ accepted: false, status: 'cancelled', reason: 'already_terminal' })

    const result = await handleTranslationResult({ messageId: 'm-cancelled', data: { success: true } })

    expect(result).toMatchObject({ success: true, handled: true, suppressed: true, status: 'cancelled' })
    expect(dispatchResultMock).not.toHaveBeenCalled()
  })

  it('does not fabricate cancellation or dispatch a missing normal result', async () => {
    getRequestMock.mockReturnValue(null)

    const result = await handleTranslationResult({ messageId: 'm-missing', data: { success: true } })

    expect(result).toMatchObject({ success: true, handled: false, reason: 'no-request-found' })
    expect(dispatchResultMock).not.toHaveBeenCalled()
  })

  it('returns a delivery failure after accepted completion without a second transition', async () => {
    getRequestMock.mockReturnValue({ messageId: 'm-delivery' })
    completeRequestMock.mockReturnValue({ accepted: true, status: 'completed', reason: 'accepted' })
    dispatchResultMock.mockRejectedValue(new Error('delivery failed'))

    const result = await handleTranslationResult({ messageId: 'm-delivery', data: { success: true } })

    expect(result).toMatchObject({ success: false, error: 'delivery failed' })
    expect(completeRequestMock).toHaveBeenCalledTimes(1)
  })
})
