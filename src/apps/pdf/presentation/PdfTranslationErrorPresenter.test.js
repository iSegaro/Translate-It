import { beforeEach, describe, expect, it, vi } from 'vitest'
import { presentPdfTranslationError } from './PdfTranslationErrorPresenter.js'
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js'
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'

vi.mock('@/shared/error-management/PublicTranslationErrorPolicy.js', () => ({
  mapCanonicalTranslationError: vi.fn((error) => ({ type: error.type, messageKey: `ERRORS_${error.type}` })),
}))

vi.mock('@/shared/error-management/PublicTranslationErrorAdapter.js', () => ({
  createLegacyDisplayError: vi.fn(async (_error, publicError) => new Error(`Localized ${publicError.type}`)),
}))

vi.mock('@/core/extensionContext.js', () => ({
  default: { isContextError: vi.fn(() => false) },
}))

describe('presentPdfTranslationError', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ['MODEL_NOT_FOUND', 'Localized MODEL_NOT_FOUND'],
    ['API_KEY_INVALID', 'Localized API_KEY_INVALID'],
    ['QUOTA_EXCEEDED', 'Localized QUOTA_EXCEEDED'],
    ['RATE_LIMIT_REACHED', 'Localized RATE_LIMIT_REACHED'],
    ['NETWORK_ERROR', 'Localized NETWORK_ERROR'],
    ['SERVER_ERROR', 'Localized SERVER_ERROR'],
    ['TRANSLATION_TIMEOUT', 'Localized TRANSLATION_TIMEOUT'],
  ])('maps %s to safe display text', async (type, message) => {
    const result = await presentPdfTranslationError({
      error: 'raw provider body with model list',
      errorDetails: { message: 'raw provider diagnostic', type },
      failureReason: 'provider-error',
    })

    expect(result).toMatchObject({ kind: 'display', message })
    expect(result.message).not.toContain('raw provider body')
    expect(result.message).not.toContain('raw provider diagnostic')
    expect(mapCanonicalTranslationError).toHaveBeenCalledWith(expect.objectContaining({ type, message: 'raw provider diagnostic' }))
  })

  it('uses structured identity instead of legacy error text', async () => {
    await presentPdfTranslationError({
      error: 'raw provider body',
      errorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' },
      failureReason: 'provider-error',
    })

    const canonicalError = mapCanonicalTranslationError.mock.calls[0][0]
    expect(canonicalError.message).toBe('raw diagnostic')
    expect(canonicalError.type).toBe('MODEL_NOT_FOUND')
    expect(createLegacyDisplayError).toHaveBeenCalledWith(canonicalError, expect.any(Object))
  })

  it('returns legacy fallback for missing or malformed details', async () => {
    await expect(presentPdfTranslationError({ error: 'legacy failure', failureReason: 'provider-error' }))
      .resolves.toEqual({ kind: 'legacy' })
    await expect(presentPdfTranslationError({
      error: 'legacy failure',
      errorDetails: { arbitrary: true },
      failureReason: 'provider-error',
    })).resolves.toEqual({ kind: 'legacy' })
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled()
  })

  it.each([
    ErrorTypes.USER_CANCELLED,
    ErrorTypes.TRANSLATION_CANCELLED,
    ErrorTypes.CONTEXT,
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ])('silences %s', async (type) => {
    const result = await presentPdfTranslationError({
      error: 'raw context diagnostic',
      errorDetails: { message: 'raw context diagnostic', type },
    })

    expect(result).toEqual({ kind: 'silent' })
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled()
  })

  it('silences recognized ExtensionContextManager context errors', async () => {
    ExtensionContextManager.isContextError.mockReturnValueOnce(true)

    await expect(presentPdfTranslationError({
      errorDetails: { message: 'context diagnostic', type: ErrorTypes.UNKNOWN },
    })).resolves.toEqual({ kind: 'silent' })
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled()
  })
})
