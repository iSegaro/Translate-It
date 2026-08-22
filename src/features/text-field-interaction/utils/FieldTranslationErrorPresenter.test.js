import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import ExtensionContextManager from '@/core/extensionContext.js';
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js';
import { PublicTranslationErrorTypes } from '@/shared/error-management/PublicTranslationError.js';
import { getFieldTranslationErrorPresentation } from './FieldTranslationErrorPresenter.js';

const makeError = (type, message = `raw ${type || 'provider'} detail`) => Object.assign(new Error(message), {
  ...(type && { type }),
  originalType: ErrorTypes.NETWORK_ERROR,
  statusCode: 502,
  providerName: 'Private Provider',
  providerId: 'private-provider',
  code: 'PRIVATE_CODE',
  errorCode: 'PRIVATE_ERROR_CODE',
  responseBody: 'private response body',
  detail: 'private detail',
  translationOutcome: { partial: true },
  arbitrary: { private: true },
});

describe('FieldTranslationErrorPresenter', () => {
  let contextErrorSpy;

  beforeEach(() => {
    contextErrorSpy = vi.spyOn(ExtensionContextManager, 'isContextError').mockReturnValue(false);
  });

  afterEach(() => {
    contextErrorSpy.mockRestore();
  });

  it.each([
    ErrorTypes.API_ERROR,
    ErrorTypes.HTTP_ERROR,
    ErrorTypes.NETWORK_ERROR,
    ErrorTypes.SERVER_ERROR,
    ErrorTypes.MODEL_OVERLOADED,
    ErrorTypes.TRANSLATION_TIMEOUT,
    ErrorTypes.API_RESPONSE_INVALID,
    ErrorTypes.JSON_PARSING_ERROR,
    ErrorTypes.API_KEY_INVALID,
    ErrorTypes.RATE_LIMIT_REACHED,
    ErrorTypes.CIRCUIT_BREAKER_OPEN,
  ])('creates sanitized presentation for %s', async (type) => {
    const sourceError = makeError(type);
    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result).toMatchObject({
      canonicalError: sourceError,
      canonicalType: type,
      publicError: expect.any(Object),
      displayError: expect.any(Error),
    });
    expect(result.displayError.message).not.toContain('raw');
    expect(result.displayError.message).not.toContain('Private Provider');
    expect(result.displayError.message).not.toContain('private response body');
  });

  it('maps HTTP_ERROR through REQUEST_FAILURE compatibility type', async () => {
    const sourceError = Object.assign(new Error('raw HTTP provider detail'), {
      type: ErrorTypes.HTTP_ERROR,
    });
    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.REQUEST_FAILURE);
    expect(result.displayError.type).toBe(ErrorTypes.HTTP_ERROR);
    expect(result.displayError.message).toBe(await getErrorMessage('ERRORS_HTTP_ERROR'));
  });

  it('uses safe fixed circuit-breaker presentation', async () => {
    const result = await getFieldTranslationErrorPresentation(makeError(ErrorTypes.CIRCUIT_BREAKER_OPEN));

    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.PROVIDER_TEMPORARILY_UNAVAILABLE);
    expect(result.displayError.type).toBe(ErrorTypes.CIRCUIT_BREAKER_OPEN);
    expect(result.displayError.message).toBe(await getErrorMessage('ERRORS_CIRCUIT_BREAKER_OPEN'));
    expect(result.displayError.message).not.toContain('raw');
  });

  it('suppresses raw API_ERROR provider text', async () => {
    const sourceError = Object.assign(new Error('provider returned private account and quota detail'), {
      type: ErrorTypes.API_ERROR,
    });
    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.API_FAILURE);
    expect(result.displayError.type).toBe(ErrorTypes.API_ERROR);
    expect(result.displayError.message).toBe(await getErrorMessage('ERRORS_API_ERROR'));
    expect(result.displayError.message).not.toContain(sourceError.message);
  });

  it('maps generic untyped errors to safe TRANSLATION_FAILED', async () => {
    const result = await getFieldTranslationErrorPresentation(new Error('raw unknown provider response'));

    expect(result.canonicalType).toBeNull();
    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.message).toBe(await getErrorMessage('ERRORS_TRANSLATION_FAILED'));
  });

  it('maps unknown explicit types to safe TRANSLATION_FAILED', async () => {
    const sourceError = makeError('UNKNOWN_PROVIDER_INTERNAL_TYPE');
    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result.canonicalType).toBe('UNKNOWN_PROVIDER_INTERNAL_TYPE');
    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.message).not.toContain(sourceError.message);
  });

  it('normalizes serialized error-like objects while preserving canonical identity fields', async () => {
    const serializedError = {
      message: 'raw serialized provider detail',
      type: ErrorTypes.API_ERROR,
      originalType: ErrorTypes.SERVER_ERROR,
      statusCode: 503,
      providerName: 'Private Provider',
      providerId: 'private-provider',
      code: 'PRIVATE_CODE',
      errorCode: 'PRIVATE_ERROR_CODE',
      translationOutcome: { partial: true },
      arbitrary: { private: true },
    };
    const result = await getFieldTranslationErrorPresentation(serializedError);

    expect(result.canonicalError).toBeInstanceOf(Error);
    expect(result.canonicalError).not.toBe(serializedError);
    expect(result.canonicalError).toMatchObject({
      message: serializedError.message,
      type: serializedError.type,
      originalType: serializedError.originalType,
      statusCode: serializedError.statusCode,
      providerName: serializedError.providerName,
      providerId: serializedError.providerId,
      code: serializedError.code,
      errorCode: serializedError.errorCode,
      translationOutcome: serializedError.translationOutcome,
    });
    expect(result.displayError.message).not.toContain(serializedError.message);
    expect(result.displayError).not.toHaveProperty('statusCode');
    expect(result.displayError).not.toHaveProperty('originalType');
    expect(result.displayError).not.toHaveProperty('providerName');
    expect(result.displayError).not.toHaveProperty('providerId');
    expect(result.displayError).not.toHaveProperty('code');
    expect(result.displayError).not.toHaveProperty('errorCode');
    expect(result.displayError).not.toHaveProperty('translationOutcome');
    expect(result.displayError).not.toHaveProperty('arbitrary');
  });

  it('normalizes string input to a safe generic presentation', async () => {
    const result = await getFieldTranslationErrorPresentation('raw provider string detail');

    expect(result.canonicalError).toBeInstanceOf(Error);
    expect(result.publicError.type).toBe(PublicTranslationErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(result.displayError.message).not.toContain('raw provider string detail');
  });

  it('returns null for explicit cancellation identities', async () => {
    const cases = [
      Object.assign(new Error('cancelled'), { type: ErrorTypes.USER_CANCELLED }),
      Object.assign(new Error('cancelled'), { type: ErrorTypes.TRANSLATION_CANCELLED }),
    ];

    for (const error of cases) {
      await expect(getFieldTranslationErrorPresentation(error)).resolves.toBeNull();
    }
  });

  it('returns null when ExtensionContextManager classifies error as context failure', async () => {
    contextErrorSpy.mockReturnValue(true);

    await expect(
      getFieldTranslationErrorPresentation(makeError(ErrorTypes.API_ERROR)),
    ).resolves.toBeNull();
  });

  it.each([
    ErrorTypes.CONTEXT,
    ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
  ])('returns null for explicit context type %s', async (type) => {
    await expect(getFieldTranslationErrorPresentation(makeError(type))).resolves.toBeNull();
  });

  it('does not mutate native canonical Error', async () => {
    const sourceError = makeError(ErrorTypes.API_ERROR);
    const originalKeys = Object.keys(sourceError);
    const originalMessage = sourceError.message;
    const originalValues = { ...sourceError };

    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result.canonicalError).toBe(sourceError);
    expect(sourceError.message).toBe(originalMessage);
    expect(Object.keys(sourceError)).toEqual(originalKeys);
    expect({ ...sourceError }).toEqual(originalValues);
  });

  it('keeps canonical Error as non-enumerable display cause', async () => {
    const sourceError = makeError(ErrorTypes.API_ERROR);
    const result = await getFieldTranslationErrorPresentation(sourceError);

    expect(result.displayError.cause).toBe(sourceError);
    expect(Object.prototype.propertyIsEnumerable.call(result.displayError, 'cause')).toBe(false);
    expect(Object.keys(result.displayError)).not.toContain('cause');
  });
});
