import { beforeEach, describe, expect, it, vi } from 'vitest';
import { presentSubtitleTranslationError } from './SubtitleTranslationErrorPresenter.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('@/shared/error-management/PublicTranslationErrorPolicy.js', () => ({
  mapCanonicalTranslationError: vi.fn((error) => ({ type: error.type, messageKey: `ERRORS_${error.type}` }))
}));

vi.mock('@/shared/error-management/PublicTranslationErrorAdapter.js', () => ({
  createLegacyDisplayError: vi.fn(async (_error, publicError) => new Error(`Localized ${publicError.type}`))
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: { isContextError: vi.fn(() => false) }
}));

describe('presentSubtitleTranslationError', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    'MODEL_NOT_FOUND',
    'API_KEY_INVALID',
    'RATE_LIMIT_REACHED',
    'QUOTA_EXCEEDED',
    'TRANSLATION_TIMEOUT',
    'NETWORK_ERROR',
    'SERVER_ERROR',
    'API_RESPONSE_INVALID'
  ])('maps %s to safe display text', async (type) => {
    const result = await presentSubtitleTranslationError({
      error: 'raw provider body with model list',
      errorDetails: { message: 'raw provider diagnostic', type }
    });

    expect(result).toMatchObject({ kind: 'display', message: `Localized ${type}` });
    expect(result.message).not.toContain('raw provider');
    expect(mapCanonicalTranslationError).toHaveBeenCalledWith(expect.objectContaining({ type }));
  });

  it('gives structured identity precedence over legacy error', async () => {
    await presentSubtitleTranslationError({
      error: 'raw provider body',
      errorDetails: { message: 'raw diagnostic', type: 'MODEL_NOT_FOUND' }
    });

    const canonicalError = mapCanonicalTranslationError.mock.calls[0][0];
    expect(canonicalError.type).toBe('MODEL_NOT_FOUND');
    expect(createLegacyDisplayError).toHaveBeenCalledWith(canonicalError, expect.any(Object));
  });

  it('preserves legacy fallback for missing or malformed details', async () => {
    await expect(presentSubtitleTranslationError({ error: 'legacy failure' }))
      .resolves.toEqual({ kind: 'legacy' });
    await expect(presentSubtitleTranslationError({ error: 'legacy failure', errorDetails: { arbitrary: true } }))
      .resolves.toEqual({ kind: 'legacy' });
  });

  it.each([
    ErrorTypes.USER_CANCELLED,
    ErrorTypes.TRANSLATION_CANCELLED,
    ErrorTypes.CONTEXT,
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
  ])('silences %s', async (type) => {
    await expect(presentSubtitleTranslationError({
      error: 'raw context diagnostic',
      errorDetails: { message: 'raw context diagnostic', type }
    })).resolves.toEqual({ kind: 'silent' });
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled();
  });

  it('silences recognized extension context errors', async () => {
    ExtensionContextManager.isContextError.mockReturnValueOnce(true);

    await expect(presentSubtitleTranslationError({
      errorDetails: { message: 'context diagnostic', type: ErrorTypes.UNKNOWN }
    })).resolves.toEqual({ kind: 'silent' });
  });
});
