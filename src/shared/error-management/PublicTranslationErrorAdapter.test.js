import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from './ErrorTypes.js';
import {
  PublicTranslationErrorActions,
  PublicTranslationErrorTypes,
} from './PublicTranslationError.js';
import { PublicTranslationErrorMessageKeys } from './PublicTranslationErrorPolicy.js';

vi.mock('./ErrorMessages.js', () => ({
  getErrorMessage: vi.fn(async (messageKey) => `Localized ${messageKey}`),
}));

import {
  createLegacyDisplayError,
  PUBLIC_TO_LEGACY_ERROR_TYPES,
} from './PublicTranslationErrorAdapter.js';
import { getErrorMessage } from './ErrorMessages.js';

const canonicalError = () => Object.assign(new Error('raw provider response'), {
  statusCode: 400,
  providerName: 'Provider',
  arbitrary: { secret: true },
  translationOutcome: { committedParentCount: 1 },
});

describe('PublicTranslationErrorAdapter', () => {
  beforeEach(() => {
    getErrorMessage.mockClear();
  });

  it.each([
    [PublicTranslationErrorTypes.MODEL_UNAVAILABLE, ErrorTypes.MODEL_MISSING],
    [PublicTranslationErrorTypes.ELEMENT_TOO_LARGE, ErrorTypes.ELEMENT_TOO_LARGE],
    [PublicTranslationErrorTypes.API_KEY_MISSING, ErrorTypes.API_KEY_MISSING],
    [PublicTranslationErrorTypes.API_KEY_INVALID, ErrorTypes.API_KEY_INVALID],
    [PublicTranslationErrorTypes.QUOTA_EXCEEDED, ErrorTypes.QUOTA_EXCEEDED],
    [PublicTranslationErrorTypes.GEMINI_QUOTA_REGION, ErrorTypes.GEMINI_QUOTA_REGION],
    [PublicTranslationErrorTypes.DEEPL_QUOTA_EXCEEDED, ErrorTypes.DEEPL_QUOTA_EXCEEDED],
    [PublicTranslationErrorTypes.INSUFFICIENT_BALANCE, ErrorTypes.INSUFFICIENT_BALANCE],
    [PublicTranslationErrorTypes.RATE_LIMITED, ErrorTypes.RATE_LIMIT_REACHED],
    [PublicTranslationErrorTypes.MODEL_OVERLOADED, ErrorTypes.MODEL_OVERLOADED],
    [PublicTranslationErrorTypes.API_FAILURE, ErrorTypes.API_ERROR],
    [PublicTranslationErrorTypes.NETWORK_ERROR, ErrorTypes.NETWORK_ERROR],
    [PublicTranslationErrorTypes.SERVER_ERROR, ErrorTypes.SERVER_ERROR],
    [PublicTranslationErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.TRANSLATION_TIMEOUT],
    [PublicTranslationErrorTypes.INVALID_RESPONSE, ErrorTypes.API_RESPONSE_INVALID],
    [PublicTranslationErrorTypes.INVALID_INPUT, ErrorTypes.TRANSLATION_FAILED],
    [PublicTranslationErrorTypes.INVALID_REQUEST, ErrorTypes.INVALID_REQUEST],
    [PublicTranslationErrorTypes.REQUEST_FAILURE, ErrorTypes.HTTP_ERROR],
    [PublicTranslationErrorTypes.API_URL_MISSING, ErrorTypes.API_URL_MISSING],
    [PublicTranslationErrorTypes.CONFIGURATION_INVALID, ErrorTypes.API_CONFIG_INVALID],
    [PublicTranslationErrorTypes.ENDPOINT_INVALID, ErrorTypes.API_ENDPOINT_INVALID],
    [PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE, ErrorTypes.BROWSER_API_UNAVAILABLE],
    [PublicTranslationErrorTypes.ACCESS_DENIED, ErrorTypes.FORBIDDEN_ERROR],
    [PublicTranslationErrorTypes.TRANSLATION_FAILED, ErrorTypes.TRANSLATION_FAILED],
  ])('maps %s to legacy type %s', async (publicType, legacyType) => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: publicType,
      messageKey: PublicTranslationErrorMessageKeys[publicType],
    });

    expect(displayError.type).toBe(legacyType);
  });

  it('resolves DTO messageKey through ErrorMessages', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.NETWORK_ERROR,
      messageKey: 'ERRORS_NETWORK_ERROR',
    });

    expect(getErrorMessage).toHaveBeenCalledWith('ERRORS_NETWORK_ERROR');
    expect(displayError.message).toBe('Localized ERRORS_NETWORK_ERROR');
  });

  it('preserves generic HTTP display semantics through REQUEST_FAILURE', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.REQUEST_FAILURE,
      messageKey: 'ERRORS_HTTP_ERROR',
      action: PublicTranslationErrorActions.RETRY,
      severity: 'warning',
    });

    expect(getErrorMessage).toHaveBeenCalledWith('ERRORS_HTTP_ERROR');
    expect(displayError.type).toBe(ErrorTypes.HTTP_ERROR);
    expect(displayError.message).toBe('Localized ERRORS_HTTP_ERROR');
    expect(displayError.cause).toBeDefined();
  });

  it('never uses canonical raw message as display text', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.SERVER_ERROR,
      messageKey: 'ERRORS_SERVER_ERROR',
    });

    expect(displayError.message).toBe('Localized ERRORS_SERVER_ERROR');
    expect(displayError.message).not.toContain('raw provider response');
  });

  it('returns null for silent DTOs', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.TRANSLATION_FAILED,
      messageKey: 'ERRORS_TRANSLATION_FAILED',
      silent: true,
    });

    expect(displayError).toBeNull();
    expect(getErrorMessage).not.toHaveBeenCalled();
  });

  it('keeps canonical error only as non-enumerable cause', async () => {
    const source = canonicalError();
    const displayError = await createLegacyDisplayError(source, {
      type: PublicTranslationErrorTypes.NETWORK_ERROR,
      messageKey: 'ERRORS_NETWORK_ERROR',
      action: PublicTranslationErrorActions.RETRY,
      detail: { kind: 'provider', value: 'provider' },
    });

    expect(displayError.cause).toBe(source);
    expect(Object.keys(displayError)).toEqual(['type']);
    expect(displayError).not.toHaveProperty('action');
    expect(displayError).not.toHaveProperty('detail');
    expect(displayError).not.toHaveProperty('translationOutcome');
    expect(displayError).not.toHaveProperty('arbitrary');
    expect(displayError).not.toHaveProperty('statusCode');
    expect(displayError).not.toHaveProperty('providerName');
  });

  it('uses temporary translation-failed localization for INVALID_INPUT', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.INVALID_INPUT,
      messageKey: 'ERRORS_INVALID_INPUT',
    });

    expect(getErrorMessage).toHaveBeenCalledWith('ERRORS_TRANSLATION_FAILED');
    expect(displayError.type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(displayError.message).toBe('Localized ERRORS_TRANSLATION_FAILED');
  });

  it('maps unknown model DTO to model-missing legacy semantics', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: PublicTranslationErrorTypes.MODEL_UNAVAILABLE,
      messageKey: 'ERRORS_MODEL_MISSING',
      detail: { kind: 'provider', value: 'gemini' },
    });

    expect(displayError.type).toBe(ErrorTypes.MODEL_MISSING);
    expect(displayError.message).toBe('Localized ERRORS_MODEL_MISSING');
    expect(displayError).not.toHaveProperty('detail');
  });

  it('falls back to translation-failed legacy type for unknown public types', async () => {
    const displayError = await createLegacyDisplayError(canonicalError(), {
      type: 'UNMAPPED_PUBLIC_TYPE',
      messageKey: 'ERRORS_TRANSLATION_FAILED',
    });

    expect(displayError.type).toBe(ErrorTypes.TRANSLATION_FAILED);
  });

  it('keeps mapping table explicit', () => {
    expect(PUBLIC_TO_LEGACY_ERROR_TYPES[PublicTranslationErrorTypes.MODEL_UNAVAILABLE])
      .toBe(ErrorTypes.MODEL_MISSING);
    expect(PUBLIC_TO_LEGACY_ERROR_TYPES).not.toHaveProperty('UNMAPPED_PUBLIC_TYPE');
  });
});
