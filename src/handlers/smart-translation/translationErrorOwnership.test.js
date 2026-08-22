import { describe, expect, it } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import {
  isFieldTranslationRequestError,
  markFieldTranslationRequestError,
} from './translationErrorOwnership.js';

describe('Field translation request error ownership', () => {
  it('marks request Error without changing identity or fields', () => {
    const error = Object.assign(new Error('provider failure'), {
      type: ErrorTypes.API_ERROR,
      statusCode: 502,
      providerName: 'provider',
    });
    const keys = Object.keys(error);

    const marked = markFieldTranslationRequestError(error);

    expect(marked).toBe(error);
    expect(isFieldTranslationRequestError(error)).toBe(true);
    expect(error.message).toBe('provider failure');
    expect(error.type).toBe(ErrorTypes.API_ERROR);
    expect(error.statusCode).toBe(502);
    expect(error.providerName).toBe('provider');
    expect(Object.keys(error)).toEqual(keys);
  });

  it('marks serialized error-like objects without exposing marker through enumeration', () => {
    const error = {
      message: 'serialized provider failure',
      type: ErrorTypes.HTTP_ERROR,
      statusCode: 503,
      providerId: 'provider-id',
    };

    const marked = markFieldTranslationRequestError(error);

    expect(marked).toBe(error);
    expect(isFieldTranslationRequestError(error)).toBe(true);
    expect(Object.keys(error)).toEqual([
      'message',
      'type',
      'statusCode',
      'providerId',
    ]);
    expect(JSON.stringify(error)).not.toContain('field-translation-request-error');
  });

  it('normalizes primitive response errors before marking', () => {
    const marked = markFieldTranslationRequestError('provider failure');

    expect(marked).toBeInstanceOf(Error);
    expect(marked.message).toBe('provider failure');
    expect(isFieldTranslationRequestError(marked)).toBe(true);
  });

  it.each([
    Object.assign(new Error('cancelled'), { type: ErrorTypes.USER_CANCELLED }),
    Object.assign(new Error('cancelled'), { type: ErrorTypes.TRANSLATION_CANCELLED }),
  ])('does not mark cancellation: %s', (error) => {
    const result = markFieldTranslationRequestError(error);

    expect(result).toBe(error);
    expect(isFieldTranslationRequestError(error)).toBe(false);
  });

  it('does not mark context errors', () => {
    const error = Object.assign(new Error('Extension context invalidated'), {
      type: ErrorTypes.EXTENSION_CONTEXT_INVALIDATED,
    });

    const result = markFieldTranslationRequestError(error);

    expect(result).toBe(error);
    expect(isFieldTranslationRequestError(error)).toBe(false);
  });
});
