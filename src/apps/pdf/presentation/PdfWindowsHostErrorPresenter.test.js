import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js'
import {
  getPdfWindowsHostTranslationPresentation,
  isTranslationDomainError,
  presentPdfWindowsHostTranslationError
} from './PdfWindowsHostErrorPresenter.js'

const mocks = vi.hoisted(() => ({
  isCancellationError: vi.fn(() => false),
  isContextError: vi.fn(() => false),
}))

vi.mock('@/shared/error-management/ErrorMatcher.js', async () => {
  const actual = await vi.importActual('@/shared/error-management/ErrorMatcher.js')
  return {
    ...actual,
    isCancellationError: mocks.isCancellationError,
  }
})

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: mocks.isContextError,
  },
}))

const canonicalError = (type, message, fields = {}) => Object.assign(new Error(message), {
  ...(type && { type }),
  ...fields,
})

describe('PdfWindowsHostErrorPresenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isCancellationError.mockReturnValue(false)
    mocks.isContextError.mockReturnValue(false)
  })

  describe('isTranslationDomainError', () => {
    it('accepts errors carrying a canonical type', () => {
      expect(isTranslationDomainError(canonicalError(ErrorTypes.API_ERROR, 'raw'))).toBe(true)
    })

    it('rejects untyped local/operational errors', () => {
      expect(isTranslationDomainError(new Error('local failure'))).toBe(false)
      expect(isTranslationDomainError('Provider unavailable')).toBe(false)
      expect(isTranslationDomainError(null)).toBe(false)
    })
  })

  it('maps structured provider failures to safe localized messages', async () => {
    const error = canonicalError(ErrorTypes.MODEL_MISSING, 'raw model gemini-2.5-flash', {
      providerName: 'Private Provider',
      providerId: 'private-provider',
    })

    const message = await presentPdfWindowsHostTranslationError(error)

    expect(message).toBe(await getErrorMessage('ERRORS_MODEL_MISSING'))
    expect(message).not.toContain('gemini-2.5-flash')
    expect(message).not.toContain('Private Provider')
  })

  it.each([
    [400, false],
    [404, false],
    [409, true],
    [500, true],
  ])('resolves retry action for HTTP %s', async (statusCode, canRetry) => {
    const presentation = await getPdfWindowsHostTranslationPresentation(canonicalError(ErrorTypes.HTTP_ERROR, 'http', { statusCode }))

    expect(presentation.canRetry).toBe(canRetry)
  })

  it('maps raw API errors to safe localized messages without leaking the body', async () => {
    const error = canonicalError(ErrorTypes.API_ERROR, 'Provider said: {\\"private\\": true}', {
      statusCode: 502,
    })

    const message = await presentPdfWindowsHostTranslationError(error)

    expect(message).toBe(await getErrorMessage('ERRORS_API_ERROR'))
    expect(message).not.toContain('private')
    expect(message).not.toContain('502')
  })

  it('prefers the canonical type over a legacy message string', async () => {
    const message = await presentPdfWindowsHostTranslationError({
      type: ErrorTypes.QUOTA_EXCEEDED,
      message: 'raw quota detail',
    })

    expect(message).toBe(await getErrorMessage('ERRORS_QUOTA_EXCEEDED'))
    expect(message).not.toContain('raw quota detail')
  })

  it('falls back to a safe generic translation failure for untyped translation responses', async () => {
    const message = await presentPdfWindowsHostTranslationError({ message: 'Provider unavailable' })

    expect(message).toBe(await getErrorMessage('ERRORS_TRANSLATION_FAILED'))
    expect(message).not.toContain('Provider unavailable')
  })

  it('returns null for user cancellation', async () => {
    mocks.isCancellationError.mockReturnValue(true)

    const result = await presentPdfWindowsHostTranslationError(
      canonicalError(ErrorTypes.USER_CANCELLED, 'Translation cancelled by user')
    )

    expect(result).toBeNull()
  })

  it('returns null for context invalidation', async () => {
    mocks.isContextError.mockReturnValue(true)

    const result = await presentPdfWindowsHostTranslationError(
      canonicalError(ErrorTypes.CONTEXT, 'Extension context lost')
    )

    expect(result).toBeNull()
  })
})
