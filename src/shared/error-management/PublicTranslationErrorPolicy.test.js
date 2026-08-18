import { describe, expect, it } from 'vitest';
import { ErrorTypes } from './ErrorTypes.js';
import {
  mapCanonicalTranslationError,
  PUBLIC_TRANSLATION_ORIGINAL_TYPE_ALLOWLIST,
} from './PublicTranslationErrorPolicy.js';
import {
  PublicTranslationErrorActions,
  PublicTranslationErrorTypes,
} from './PublicTranslationError.js';

const errorWithType = (type, fields = {}) => ({ type, ...fields });

describe('PublicTranslationErrorPolicy', () => {
  it.each([
    [errorWithType(ErrorTypes.ELEMENT_TOO_LARGE), PublicTranslationErrorTypes.ELEMENT_TOO_LARGE],
    [errorWithType(ErrorTypes.API_KEY_MISSING), PublicTranslationErrorTypes.API_KEY_MISSING],
    [errorWithType(ErrorTypes.API_KEY_INVALID), PublicTranslationErrorTypes.API_KEY_INVALID],
    [errorWithType(ErrorTypes.QUOTA_EXCEEDED), PublicTranslationErrorTypes.QUOTA_EXCEEDED],
    [errorWithType(ErrorTypes.GEMINI_QUOTA_REGION), PublicTranslationErrorTypes.GEMINI_QUOTA_REGION],
    [errorWithType(ErrorTypes.DEEPL_QUOTA_EXCEEDED), PublicTranslationErrorTypes.DEEPL_QUOTA_EXCEEDED],
    [errorWithType(ErrorTypes.INSUFFICIENT_BALANCE), PublicTranslationErrorTypes.INSUFFICIENT_BALANCE],
    [errorWithType(ErrorTypes.RATE_LIMIT_REACHED), PublicTranslationErrorTypes.RATE_LIMITED],
    [errorWithType(ErrorTypes.MODEL_OVERLOADED), PublicTranslationErrorTypes.MODEL_OVERLOADED],
    [errorWithType(ErrorTypes.API_ERROR), PublicTranslationErrorTypes.API_FAILURE],
    [errorWithType(ErrorTypes.NETWORK_ERROR), PublicTranslationErrorTypes.NETWORK_ERROR],
    [errorWithType(ErrorTypes.SERVER_ERROR), PublicTranslationErrorTypes.SERVER_ERROR],
    [errorWithType(ErrorTypes.TRANSLATION_TIMEOUT), PublicTranslationErrorTypes.TRANSLATION_TIMEOUT],
    [errorWithType(ErrorTypes.API_RESPONSE_INVALID), PublicTranslationErrorTypes.INVALID_RESPONSE],
    [errorWithType(ErrorTypes.JSON_PARSING_ERROR), PublicTranslationErrorTypes.INVALID_RESPONSE],
    [errorWithType(ErrorTypes.VALIDATION), PublicTranslationErrorTypes.INVALID_INPUT],
    [errorWithType(ErrorTypes.INVALID_REQUEST), PublicTranslationErrorTypes.INVALID_REQUEST],
    [errorWithType(ErrorTypes.API_URL_MISSING), PublicTranslationErrorTypes.API_URL_MISSING],
    [errorWithType(ErrorTypes.API_CONFIG_INVALID), PublicTranslationErrorTypes.CONFIGURATION_INVALID],
    [errorWithType(ErrorTypes.API_ENDPOINT_INVALID), PublicTranslationErrorTypes.ENDPOINT_INVALID],
    [errorWithType(ErrorTypes.BROWSER_API_UNAVAILABLE), PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE],
    [errorWithType(ErrorTypes.FORBIDDEN_ERROR), PublicTranslationErrorTypes.ACCESS_DENIED],
  ])('maps %o to %s', (error, type) => {
    expect(mapCanonicalTranslationError(error)).toMatchObject({ type, silent: false });
  });

  it.each([
    [ErrorTypes.ELEMENT_TOO_LARGE, PublicTranslationErrorTypes.ELEMENT_TOO_LARGE, 'ERRORS_ELEMENT_TOO_LARGE'],
    [ErrorTypes.GEMINI_QUOTA_REGION, PublicTranslationErrorTypes.GEMINI_QUOTA_REGION, 'ERRORS_GEMINI_QUOTA_REGION'],
    [ErrorTypes.DEEPL_QUOTA_EXCEEDED, PublicTranslationErrorTypes.DEEPL_QUOTA_EXCEEDED, 'ERRORS_DEEPL_QUOTA_EXCEEDED'],
    [ErrorTypes.API_ERROR, PublicTranslationErrorTypes.API_FAILURE, 'ERRORS_API_ERROR'],
  ])('uses existing message key for %s', (internalType, type, messageKey) => {
    expect(mapCanonicalTranslationError({ type: internalType })).toMatchObject({ type, messageKey });
  });

  it('keeps UNKNOWN as generic translation failure', () => {
    expect(mapCanonicalTranslationError({ type: ErrorTypes.UNKNOWN })).toMatchObject({
      type: PublicTranslationErrorTypes.TRANSLATION_FAILED,
      messageKey: 'ERRORS_TRANSLATION_FAILED',
    });
  });

  it.each([
    [ErrorTypes.API_URL_MISSING, PublicTranslationErrorTypes.API_URL_MISSING, 'ERRORS_API_URL_MISSING', PublicTranslationErrorActions.OPEN_SETTINGS, 'warning'],
    [ErrorTypes.API_CONFIG_INVALID, PublicTranslationErrorTypes.CONFIGURATION_INVALID, 'ERRORS_API_CONFIG_INVALID', PublicTranslationErrorActions.OPEN_SETTINGS, 'error'],
    [ErrorTypes.API_ENDPOINT_INVALID, PublicTranslationErrorTypes.ENDPOINT_INVALID, 'ERRORS_API_ENDPOINT_INVALID', PublicTranslationErrorActions.OPEN_SETTINGS, 'error'],
    [ErrorTypes.BROWSER_API_UNAVAILABLE, PublicTranslationErrorTypes.BROWSER_API_UNAVAILABLE, 'ERRORS_BROWSER_API_UNAVAILABLE', undefined, 'error'],
    [ErrorTypes.FORBIDDEN_ERROR, PublicTranslationErrorTypes.ACCESS_DENIED, 'ERRORS_FORBIDDEN_ERROR', undefined, 'warning'],
  ])('preserves config/access UX for %s', (internalType, publicType, messageKey, action, severity) => {
    const result = mapCanonicalTranslationError({
      type: internalType,
      message: 'raw canonical provider detail',
    });

    expect(result).toMatchObject({ type: publicType, messageKey, severity, silent: false });
    if (action) expect(result.action).toBe(action);
    else expect(result).not.toHaveProperty('action');
    expect(result).not.toHaveProperty('message');
  });

  it('maps API_ERROR without exposing provider message', () => {
    const result = mapCanonicalTranslationError({
      type: ErrorTypes.API_ERROR,
      message: 'API_ERROR: provider response contains private detail',
      response: { body: 'private response' },
    });

    expect(result).toMatchObject({
      type: PublicTranslationErrorTypes.API_FAILURE,
      messageKey: 'ERRORS_API_ERROR',
    });
    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('response');
  });

  it('refines generic HTTP model failures only through originalType', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.HTTP_ERROR, {
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 400,
    }));

    expect(result).toMatchObject({
      type: PublicTranslationErrorTypes.MODEL_UNAVAILABLE,
      action: PublicTranslationErrorActions.OPEN_SETTINGS,
    });
  });

  it.each([400, 422, 404, 500, undefined])(
    'maps generic HTTP %s to REQUEST_FAILURE without status inference',
    (statusCode) => {
      const fields = statusCode === undefined ? {} : { statusCode };
      const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.HTTP_ERROR, fields));

      expect(result).toMatchObject({
        type: PublicTranslationErrorTypes.REQUEST_FAILURE,
        messageKey: 'ERRORS_HTTP_ERROR',
        action: PublicTranslationErrorActions.RETRY,
        severity: 'warning',
        silent: false,
      });
    },
  );

  it.each([ErrorTypes.TRANSLATION_ERROR, ErrorTypes.TRANSLATION_FAILED, ErrorTypes.UNKNOWN])(
    'does not apply HTTP status fallback to %s',
    (type) => {
      expect(mapCanonicalTranslationError(errorWithType(type, { statusCode: 400 })).type)
        .toBe(PublicTranslationErrorTypes.TRANSLATION_FAILED);
      expect(mapCanonicalTranslationError(errorWithType(type, { statusCode: 500 })).type)
        .toBe(PublicTranslationErrorTypes.TRANSLATION_FAILED);
    },
  );

  it('maps API_ERROR semantically without using status fallback', () => {
    expect(mapCanonicalTranslationError(errorWithType(ErrorTypes.API_ERROR, { statusCode: 400 }))).toMatchObject({
      type: PublicTranslationErrorTypes.API_FAILURE,
      messageKey: 'ERRORS_API_ERROR',
    });
    expect(mapCanonicalTranslationError(errorWithType(ErrorTypes.API_ERROR, { statusCode: 500 })).type)
      .toBe(PublicTranslationErrorTypes.API_FAILURE);
  });

  it('keeps explicit semantic type ahead of conflicting status', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.SERVER_ERROR, {
      statusCode: 400,
    }));

    expect(result.type).toBe(PublicTranslationErrorTypes.SERVER_ERROR);
  });

  it('keeps allowlisted originalType ahead of conflicting status', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.HTTP_ERROR, {
      originalType: ErrorTypes.MODEL_MISSING,
      statusCode: 400,
    }));

    expect(result.type).toBe(PublicTranslationErrorTypes.MODEL_UNAVAILABLE);
  });

  it('does not allow unrelated original types to refine generic transport errors', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.HTTP_ERROR, {
      originalType: 'UNTRUSTED_MODEL_FAILURE',
      statusCode: 400,
    }));

    expect(result.type).toBe(PublicTranslationErrorTypes.REQUEST_FAILURE);
  });

  it('keeps original type allowlist explicit', () => {
    expect(PUBLIC_TRANSLATION_ORIGINAL_TYPE_ALLOWLIST.has(ErrorTypes.MODEL_MISSING)).toBe(true);
    expect(PUBLIC_TRANSLATION_ORIGINAL_TYPE_ALLOWLIST.has('UNTRUSTED_MODEL_FAILURE')).toBe(false);
  });

  it('maps cancellation to silent semantics', () => {
    const result = mapCanonicalTranslationError({
      type: ErrorTypes.USER_CANCELLED,
      message: 'raw cancellation detail',
      isCancelled: true,
    });

    expect(result).toMatchObject({
      silent: true,
      type: PublicTranslationErrorTypes.TRANSLATION_FAILED,
    });
  });

  it('maps unknown runtime failures to safe translation failure', () => {
    const result = mapCanonicalTranslationError({
      type: 'UNMAPPED_RUNTIME_ERROR',
      message: 'provider secret response body',
    });

    expect(result).toMatchObject({
      type: PublicTranslationErrorTypes.TRANSLATION_FAILED,
      action: PublicTranslationErrorActions.RETRY,
    });
  });

  it('includes only bounded provider detail from canonical fields', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.MODEL_MISSING, {
      providerId: 'gemini',
      providerName: 'Gemini',
      message: "Unknown model name: 'gemini-flash-3'",
      model: 'gemini-flash-3',
    }));

    expect(result.detail).toEqual({ kind: 'provider', value: 'gemini' });
    expect(result).not.toHaveProperty('model');
    expect(result).not.toHaveProperty('message');
  });

  it('drops unsafe provider detail', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.API_KEY_INVALID, {
      providerId: '<script>alert(1)</script>',
      providerName: 'A'.repeat(100),
      message: 'raw provider response',
    }));

    expect(result).not.toHaveProperty('detail');
  });

  it('never exposes diagnostic or arbitrary fields', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.SERVER_ERROR, {
      message: 'raw provider message',
      cause: new Error('private cause'),
      originalError: new Error('private original'),
      stack: 'private stack',
      response: { body: 'private response' },
      body: 'private body',
      arbitrary: { secret: true },
      translationOutcome: { committedParentCount: 1 },
    }));

    expect(result).not.toHaveProperty('message');
    expect(result).not.toHaveProperty('cause');
    expect(result).not.toHaveProperty('originalError');
    expect(result).not.toHaveProperty('stack');
    expect(result).not.toHaveProperty('response');
    expect(result).not.toHaveProperty('body');
    expect(result).not.toHaveProperty('arbitrary');
    expect(result).not.toHaveProperty('translationOutcome');
  });

  it('freezes DTO and nested detail', () => {
    const result = mapCanonicalTranslationError(errorWithType(ErrorTypes.API_KEY_MISSING, {
      providerId: 'openai',
    }));

    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.detail)).toBe(true);
    expect(() => { result.type = 'MUTATED'; }).toThrow();
    expect(() => { result.detail.value = 'MUTATED'; }).toThrow();
  });
});
