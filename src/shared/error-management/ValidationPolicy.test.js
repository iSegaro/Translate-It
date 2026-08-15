import { describe, it, expect } from 'vitest';
import { isLocalDeterministicValidationError } from './ValidationPolicy.js';
import { ErrorTypes } from './ErrorTypes.js';

describe('isLocalDeterministicValidationError', () => {
  it('returns true for explicit TEXT_TOO_LONG type', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.TEXT_TOO_LONG })).toBe(true);
  });

  it('returns true for explicit type with HTTP status (type is authoritative)', () => {
    expect(isLocalDeterministicValidationError({
      type: ErrorTypes.TEXT_TOO_LONG,
      statusCode: 413
    })).toBe(true);
  });

  it('returns false for message-only "text is too long"', () => {
    expect(isLocalDeterministicValidationError({ message: 'text is too long' })).toBe(false);
  });

  it('returns false for HTTP 400 with "too long" message', () => {
    expect(isLocalDeterministicValidationError({ statusCode: 400, message: 'text is too long' })).toBe(false);
  });

  it('returns false for HTTP 413 with "payload too large"', () => {
    expect(isLocalDeterministicValidationError({ statusCode: 413, message: 'payload too large' })).toBe(false);
  });

  it('returns false for HTTP 413 without message', () => {
    expect(isLocalDeterministicValidationError({ statusCode: 413 })).toBe(false);
  });

  it('returns false for API_RESPONSE_INVALID', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.API_RESPONSE_INVALID })).toBe(false);
  });

  it('returns false for NETWORK_ERROR', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.NETWORK_ERROR })).toBe(false);
  });

  it('returns false for SERVER_ERROR', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.SERVER_ERROR })).toBe(false);
  });

  it('returns false for RATE_LIMIT_REACHED', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.RATE_LIMIT_REACHED })).toBe(false);
  });

  it('returns false for USER_CANCELLED', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.USER_CANCELLED })).toBe(false);
  });

  it('returns false for TRANSLATION_TIMEOUT', () => {
    expect(isLocalDeterministicValidationError({ type: ErrorTypes.TRANSLATION_TIMEOUT })).toBe(false);
  });

  it('returns false for plain Error instance without type', () => {
    expect(isLocalDeterministicValidationError(new Error('text is too long'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isLocalDeterministicValidationError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isLocalDeterministicValidationError(undefined)).toBe(false);
  });
});
