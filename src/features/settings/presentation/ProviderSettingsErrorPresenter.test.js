import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { presentProviderSettingsError } from './ProviderSettingsErrorPresenter.js'

vi.mock('@/core/extensionContext.js', () => ({
  default: { isContextError: vi.fn(() => false) },
}))

describe('presentProviderSettingsError', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uses generic localized output for unknown errors without raw text', () => {
    const result = presentProviderSettingsError(new Error('SECRET RAW PROVIDER BODY'))

    expect(result).toEqual({ messageKey: 'ERRORS_UNKNOWN' })
    expect(JSON.stringify(result)).not.toContain('SECRET RAW PROVIDER BODY')
  })

  it.each([
    [ErrorTypes.API_KEY_INVALID, 'ERRORS_API_KEY_INVALID'],
    [ErrorTypes.MODEL_MISSING, 'ERRORS_MODEL_MISSING'],
    [ErrorTypes.QUOTA_EXCEEDED, 'ERRORS_QUOTA_EXCEEDED'],
  ])('maps canonical %s identity without exposing diagnostics', (type, messageKey) => {
    const result = presentProviderSettingsError(Object.assign(new Error('raw auth response'), {
      type,
      statusCode: 401,
      providerName: 'Provider',
      code: 'PRIVATE_CODE',
    }))

    expect(result).toEqual({ messageKey })
    expect(JSON.stringify(result)).not.toContain('raw auth response')
    expect(JSON.stringify(result)).not.toContain('PRIVATE_CODE')
  })

  it('uses originalType when it is the only canonical identity', () => {
    expect(presentProviderSettingsError({
      message: 'raw model response',
      originalType: ErrorTypes.MODEL_MISSING,
    })).toEqual({ messageKey: 'ERRORS_MODEL_MISSING' })
  })

  it.each([
    ErrorTypes.CONTEXT,
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ])('uses context-safe output for %s', (type) => {
    expect(presentProviderSettingsError({ type })).toEqual({
      messageKey: 'ERRORS_INVALID_CONTEXT',
    })
  })

  it('uses context-safe output for recognized context failures', () => {
    ExtensionContextManager.isContextError.mockReturnValueOnce(true)

    expect(presentProviderSettingsError(new Error('runtime disconnected'))).toEqual({
      messageKey: 'ERRORS_INVALID_CONTEXT',
    })
  })
})
