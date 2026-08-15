import { describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from './ErrorTypes.js';

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: vi.fn(() => false),
    isValidSync: vi.fn(() => true),
    safeI18nOperation: vi.fn((operation) => operation()),
  },
}));

vi.mock('./ErrorMatcher.js', () => ({
  matchErrorToType: vi.fn((error) => error?.type || 'UNKNOWN'),
  isCancellationError: vi.fn((error) => error?.type === ErrorTypes.USER_CANCELLED || error?.type === ErrorTypes.TRANSLATION_CANCELLED),
  isSilentError: vi.fn((type) => type === ErrorTypes.NODE_ALREADY_TRANSLATED),
}));

vi.mock('@/utils/UtilsFactory.js', () => ({
  utilsFactory: {
    getI18nUtils: vi.fn().mockResolvedValue({
      getTranslationString: vi.fn((key) => `Translated: ${key}`),
    }),
  },
}));

import {
  createPublicDisplayError,
  getPublicErrorPolicy,
  PublicErrorMessagePolicy,
} from './PublicErrorPolicy.js';

describe('PublicErrorPolicy', () => {
  it.each([
    ErrorTypes.VALIDATION,
    ErrorTypes.API_RESPONSE_INVALID,
    ErrorTypes.NO_ACCEPTED_TRANSLATION_RESULTS,
    ErrorTypes.TRANSLATION_ERROR,
    ErrorTypes.TRANSLATION_FAILED,
    ErrorTypes.UNKNOWN,
  ])('%s maps to generic translation failure', (type) => {
    expect(getPublicErrorPolicy(type)).toMatchObject({
      policy: PublicErrorMessagePolicy.LOCALIZED_GENERIC,
      type: ErrorTypes.TRANSLATION_FAILED,
    });
  });

  it.each([
    [ErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.TRANSLATION_TIMEOUT],
    [ErrorTypes.OPERATION_TIMEOUT, ErrorTypes.TRANSLATION_TIMEOUT],
    [ErrorTypes.NETWORK_ERROR, ErrorTypes.NETWORK_ERROR],
    [ErrorTypes.HTTP_ERROR, ErrorTypes.HTTP_ERROR],
    [ErrorTypes.SERVER_ERROR, ErrorTypes.SERVER_ERROR],
    [ErrorTypes.API_ERROR, ErrorTypes.API_ERROR],
    [ErrorTypes.RATE_LIMIT_REACHED, ErrorTypes.RATE_LIMIT_REACHED],
    [ErrorTypes.QUOTA_EXCEEDED, ErrorTypes.QUOTA_EXCEEDED],
    [ErrorTypes.MODEL_OVERLOADED, ErrorTypes.MODEL_OVERLOADED],
  ])('%s uses localized public type %s', (type, publicType) => {
    expect(getPublicErrorPolicy(type)).toMatchObject({
      policy: PublicErrorMessagePolicy.LOCALIZED_TYPED,
      type: publicType,
    });
  });

  it('keeps cancellation silent', () => {
    expect(getPublicErrorPolicy({ type: ErrorTypes.USER_CANCELLED })).toMatchObject({
      policy: PublicErrorMessagePolicy.SILENT,
    });
  });

  it('keeps centrally silent non-cancellation errors silent', async () => {
    const display = await createPublicDisplayError({
      type: ErrorTypes.NODE_ALREADY_TRANSLATED,
      message: 'Already translated internally',
    });

    expect(display).toBeNull();
  });

  it('maps unknown types to generic public failure', async () => {
    const original = Object.assign(new Error('Provider runtime detail'), { type: 'UNMAPPED_ERROR' });
    const display = await createPublicDisplayError(original);

    expect(display).toMatchObject({
      type: ErrorTypes.TRANSLATION_FAILED,
      message: 'Translated: ERRORS_TRANSLATION_FAILED',
      cause: original,
    });
    expect(display.message).not.toContain('Provider runtime detail');
  });

  it('retains cause and removes raw technical message', async () => {
    const original = Object.assign(new Error('Batch translation timed out after 60000ms'), {
      type: ErrorTypes.TRANSLATION_TIMEOUT,
    });
    const display = await createPublicDisplayError(original);

    expect(display).toMatchObject({
      type: ErrorTypes.TRANSLATION_TIMEOUT,
      cause: original,
      message: 'Translated: ERRORS_TRANSLATION_TIMEOUT',
    });
    expect(display.message).not.toContain('60000ms');
  });

  it('preserves translation outcome without mutating original error', async () => {
    const original = Object.assign(new Error('V3 marker detail'), {
      type: ErrorTypes.VALIDATION,
      translationOutcome: { committedParentCount: 1, totalParentCount: 2, cancelled: false },
    });
    const originalKeys = Object.keys(original);
    const display = await createPublicDisplayError(original);

    expect(display.translationOutcome).toEqual(original.translationOutcome);
    expect(display.cause).toBe(original);
    expect(Object.keys(original)).toEqual(originalKeys);
    expect(original.message).toBe('V3 marker detail');
    expect(original.type).toBe(ErrorTypes.VALIDATION);
  });

  it('maps operation timeout to localized translation timeout', async () => {
    const display = await createPublicDisplayError(Object.assign(new Error('Operation deadline exceeded at 45000ms'), {
      type: ErrorTypes.OPERATION_TIMEOUT,
    }));

    expect(display).toMatchObject({
      type: ErrorTypes.TRANSLATION_TIMEOUT,
      message: 'Translated: ERRORS_TRANSLATION_TIMEOUT',
    });
  });
});
