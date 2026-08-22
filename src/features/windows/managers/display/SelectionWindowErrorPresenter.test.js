import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { getErrorMessage } from '@/shared/error-management/ErrorMessages.js';
import { getSelectionWindowErrorPresentation } from './SelectionWindowErrorPresenter.js';

const mocks = vi.hoisted(() => ({
  mapCanonicalTranslationError: vi.fn(),
  createLegacyDisplayError: vi.fn(),
  isCancellationError: vi.fn(() => false),
  isContextError: vi.fn(() => false),
}));

vi.mock('@/shared/error-management/PublicTranslationErrorPolicy.js', async () => {
  const actual = await vi.importActual('@/shared/error-management/PublicTranslationErrorPolicy.js');
  return {
    ...actual,
    mapCanonicalTranslationError: mocks.mapCanonicalTranslationError.mockImplementation(actual.mapCanonicalTranslationError),
  };
});

vi.mock('@/shared/error-management/PublicTranslationErrorAdapter.js', async () => {
  const actual = await vi.importActual('@/shared/error-management/PublicTranslationErrorAdapter.js');
  return {
    ...actual,
    createLegacyDisplayError: mocks.createLegacyDisplayError.mockImplementation(actual.createLegacyDisplayError),
  };
});

vi.mock('@/shared/error-management/ErrorMatcher.js', () => ({
  isCancellationError: mocks.isCancellationError,
}));

vi.mock('@/core/extensionContext.js', () => ({
  default: {
    isContextError: mocks.isContextError,
  },
}));

const errorHandler = {
  getErrorForUI: vi.fn(),
};

const canonicalError = (type, fields = {}) => Object.assign(new Error(`raw ${type || 'provider'} detail`), {
  ...(type && { type }),
  ...fields,
});

describe('SelectionWindowErrorPresenter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCancellationError.mockReturnValue(false);
    mocks.isContextError.mockReturnValue(false);
    errorHandler.getErrorForUI.mockResolvedValue({
      message: 'safe localized message',
      type: ErrorTypes.API_ERROR,
      canRetry: false,
      needsSettings: false,
    });
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
  ])('passes adapted Error only for %s', async (type) => {
    const sourceError = canonicalError(type, {
      statusCode: 502,
      originalType: ErrorTypes.NETWORK_ERROR,
      providerName: 'Private Provider',
      providerId: 'private-provider',
      responseBody: 'private response body',
      code: 'PRIVATE_CODE',
      errorCode: 'PRIVATE_ERROR_CODE',
      translationOutcome: 'private outcome',
      arbitrary: { private: true },
    });
    const result = await getSelectionWindowErrorPresentation(sourceError, 'windows-translation', errorHandler);

    expect(mocks.mapCanonicalTranslationError).toHaveBeenCalledTimes(1);
    expect(mocks.mapCanonicalTranslationError).toHaveBeenCalledWith(sourceError);
    expect(mocks.createLegacyDisplayError).toHaveBeenCalledTimes(1);
    const publicError = mocks.mapCanonicalTranslationError.mock.results[0].value;
    expect(mocks.createLegacyDisplayError).toHaveBeenCalledWith(sourceError, publicError);
    expect(errorHandler.getErrorForUI).toHaveBeenCalledTimes(1);
    const passedDisplayError = errorHandler.getErrorForUI.mock.calls[0][0];
    expect(passedDisplayError).toBeInstanceOf(Error);
    expect(errorHandler.getErrorForUI).toHaveBeenCalledWith(passedDisplayError, 'windows-translation');
    expect(errorHandler.getErrorForUI).not.toHaveBeenCalledWith(sourceError, expect.anything());
    expect(result).toMatchObject({ displayError: passedDisplayError, canonicalType: type });
    expect(passedDisplayError.message).not.toContain('raw');
    expect(result.errorInfo.message).not.toContain('raw');
    expect(passedDisplayError).not.toHaveProperty('statusCode');
    expect(passedDisplayError).not.toHaveProperty('originalType');
    expect(passedDisplayError).not.toHaveProperty('providerName');
    expect(passedDisplayError).not.toHaveProperty('providerId');
    expect(passedDisplayError).not.toHaveProperty('responseBody');
    expect(passedDisplayError).not.toHaveProperty('code');
    expect(passedDisplayError).not.toHaveProperty('errorCode');
    expect(passedDisplayError).not.toHaveProperty('translationOutcome');
    expect(passedDisplayError).not.toHaveProperty('arbitrary');
    expect(passedDisplayError.cause).toBe(sourceError);
    expect(Object.prototype.propertyIsEnumerable.call(passedDisplayError, 'cause')).toBe(false);
    expect(result).not.toHaveProperty('statusCode');
    expect(result).not.toHaveProperty('providerName');
    expect(result).not.toHaveProperty('responseBody');
  });

  it.each([
    [ErrorTypes.MODEL_MISSING, 'ERRORS_MODEL_MISSING'],
    [ErrorTypes.API_KEY_INVALID, 'ERRORS_API_KEY_INVALID'],
    [ErrorTypes.QUOTA_EXCEEDED, 'ERRORS_QUOTA_EXCEEDED'],
    [ErrorTypes.RATE_LIMIT_REACHED, 'ERRORS_RATE_LIMIT_REACHED'],
    [ErrorTypes.CIRCUIT_BREAKER_OPEN, 'ERRORS_CIRCUIT_BREAKER_OPEN'],
    [ErrorTypes.LANGUAGE_PAIR_NOT_SUPPORTED, 'ERRORS_LANGUAGE_PAIR_NOT_SUPPORTED'],
  ])('preserves safe localized message for %s', async (type, messageKey) => {
    const sourceError = canonicalError(type);
    errorHandler.getErrorForUI.mockImplementation(async (displayError) => ({
      message: displayError.message,
      type: displayError.type,
      canRetry: false,
      needsSettings: false,
    }));

    const result = await getSelectionWindowErrorPresentation(sourceError, 'windows-translation', errorHandler);

    expect(result.errorInfo.message).toBe(await getErrorMessage(messageKey));
    expect(result.errorInfo.message).not.toContain(sourceError.message);
  });

  it('maps generic untyped errors to safe translation failure data', async () => {
    const sourceError = new Error('raw unknown provider response');
    errorHandler.getErrorForUI.mockImplementation(async (displayError) => ({
      message: displayError.message,
      type: displayError.type,
      canRetry: false,
      needsSettings: false,
    }));

    const result = await getSelectionWindowErrorPresentation(sourceError, 'windows-translation', errorHandler);

    expect(result.canonicalType).toBeNull();
    expect(result.errorInfo.type).toBe(ErrorTypes.TRANSLATION_FAILED);
    expect(result.errorInfo.message).toBe(await getErrorMessage('ERRORS_TRANSLATION_FAILED'));
  });

  it.each([
    ['cancellation', () => mocks.isCancellationError.mockReturnValue(true)],
    ['context invalidation', () => mocks.isContextError.mockReturnValue(true)],
    ['explicit context type', () => {}],
    ['explicit extension invalidation type', () => {}],
  ])('returns no presentation for %s', async (_label, configure) => {
    const type = _label === 'explicit context type'
      ? ErrorTypes.CONTEXT
      : _label === 'explicit extension invalidation type'
        ? ErrorTypes.EXTENSION_CONTEXT_INVALIDATED
        : ErrorTypes.API_ERROR;
    configure();

    const result = await getSelectionWindowErrorPresentation(canonicalError(type), 'windows-translation', errorHandler);

    expect(result).toBeNull();
    expect(mocks.mapCanonicalTranslationError).not.toHaveBeenCalled();
    expect(mocks.createLegacyDisplayError).not.toHaveBeenCalled();
    expect(errorHandler.getErrorForUI).not.toHaveBeenCalled();
  });

  it('does not mutate canonical Error', async () => {
    const sourceError = canonicalError(ErrorTypes.API_ERROR, { providerName: 'Private Provider' });
    const originalKeys = Object.keys(sourceError);
    const originalMessage = sourceError.message;

    await getSelectionWindowErrorPresentation(sourceError, 'windows-translation', errorHandler);

    expect(sourceError.message).toBe(originalMessage);
    expect(Object.keys(sourceError)).toEqual(originalKeys);
    expect(sourceError.providerName).toBe('Private Provider');
  });

  it('returns ErrorHandler action and localization fields unchanged', async () => {
    const sourceError = canonicalError(ErrorTypes.HTTP_ERROR);
    const errorInfo = {
      message: 'safe HTTP message',
      type: ErrorTypes.HTTP_ERROR,
      canRetry: true,
      needsSettings: true,
    };
    errorHandler.getErrorForUI.mockResolvedValue(errorInfo);

    const result = await getSelectionWindowErrorPresentation(sourceError, 'windows-translation', errorHandler);

    expect(result.errorInfo).toBe(errorInfo);
  });
});
