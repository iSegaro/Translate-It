import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPageTranslationErrorPresentation } from './PageTranslationErrorPresenter.js';
import { mapCanonicalTranslationError } from '@/shared/error-management/PublicTranslationErrorPolicy.js';
import { createLegacyDisplayError } from '@/shared/error-management/PublicTranslationErrorAdapter.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('@/shared/error-management/PublicTranslationErrorPolicy.js', () => ({
  mapCanonicalTranslationError: vi.fn(() => ({
    type: 'MODEL_UNAVAILABLE',
    messageKey: 'ERRORS_MODEL_MISSING',
    silent: false,
  })),
}));

vi.mock('@/shared/error-management/PublicTranslationErrorAdapter.js', () => ({
  createLegacyDisplayError: vi.fn(async () => new Error('Localized model error')),
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: { isContextError: vi.fn(() => false) },
}));

describe('getPageTranslationErrorPresentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('prefers structured errorDetails and returns safe display text', async () => {
    const result = await getPageTranslationErrorPresentation({
      error: 'raw provider failure',
      errorDetails: {
        type: 'MODEL_NOT_FOUND',
        message: 'raw canonical diagnostic',
        providerName: 'Provider',
        providerId: 'provider-id',
      },
    });

    const canonicalError = mapCanonicalTranslationError.mock.calls[0][0];
    expect(canonicalError).toMatchObject({
      type: 'MODEL_NOT_FOUND',
      message: 'raw canonical diagnostic',
      providerName: 'Provider',
      providerId: 'provider-id',
    });
    expect(result.message).toBe('Localized model error');
    expect(result.message).not.toContain('raw provider failure');
    expect(result.message).not.toContain('raw canonical diagnostic');
    expect(createLegacyDisplayError).toHaveBeenCalledWith(canonicalError, expect.any(Object));
  });

  it('uses legacy error and errorType when errorDetails is absent', async () => {
    await getPageTranslationErrorPresentation({
      error: 'legacy failure',
      errorType: 'MODEL_MISSING',
    });

    expect(mapCanonicalTranslationError.mock.calls[0][0]).toMatchObject({
      message: 'legacy failure',
      type: 'MODEL_MISSING',
    });
  });

  it('falls back to legacy error when errorDetails is malformed', async () => {
    await getPageTranslationErrorPresentation({
      error: 'legacy failure',
      errorDetails: { arbitrary: true },
      errorType: 'MODEL_MISSING',
    });

    expect(mapCanonicalTranslationError.mock.calls[0][0]).toMatchObject({
      message: 'legacy failure',
      type: 'MODEL_MISSING',
    });
  });

  it('silently ignores cancellation errors', async () => {
    const result = await getPageTranslationErrorPresentation({
      errorDetails: {
        message: 'cancelled',
        type: 'TRANSLATION_CANCELLED',
      },
    });

    expect(result).toBeNull();
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled();
  });

  it.each([
    ErrorTypes.CONTEXT,
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ])('silently ignores %s errors', async (type) => {
    const result = await getPageTranslationErrorPresentation({
      errorDetails: { message: 'context failure', type },
    });

    expect(result).toBeNull();
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled();
  });

  it('silently ignores recognized ExtensionContextManager errors', async () => {
    ExtensionContextManager.isContextError.mockReturnValueOnce(true);

    const result = await getPageTranslationErrorPresentation({
      errorDetails: { message: 'context failure', type: ErrorTypes.UNKNOWN },
    });

    expect(result).toBeNull();
    expect(mapCanonicalTranslationError).not.toHaveBeenCalled();
  });
});
