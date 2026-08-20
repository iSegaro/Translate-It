import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTranslate } from './handleTranslate.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

const { handleError } = vi.hoisted(() => ({ handleError: vi.fn() }));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn(),
  },
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: class {
    handle = handleError;
  },
}));

describe('handleTranslate failure routing', () => {
  const message = {
    action: 'TRANSLATE',
    messageId: 'translate-message',
    context: 'content',
    data: { text: 'Hello' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.backgroundService = { translationEngine: {} };
  });

  it('keeps structured error-only results normalized under error', async () => {
    const result = {
      success: false,
      error: {
        message: 'Provider failed',
        type: ErrorTypes.NETWORK_ERROR,
      },
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error: result.error,
      messageId: message.messageId,
    });
  });

  it('prefers canonical errorDetails over conflicting error', async () => {
    const result = {
      success: false,
      error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
      errorDetails: {
        message: 'canonical failure',
        type: ErrorTypes.HTTP_ERROR,
        originalType: ErrorTypes.MODEL_MISSING,
        statusCode: 503,
        context: 'provider-request',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
      },
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    const response = await handleTranslate(message, {});

    expect(response).toMatchObject({
      success: false,
    });
    expect(response.error).toMatchObject({
      message: result.errorDetails.message,
      type: result.errorDetails.type,
      originalType: result.errorDetails.originalType,
      statusCode: result.errorDetails.statusCode,
      providerName: result.errorDetails.providerName,
      providerId: result.errorDetails.providerId,
      code: result.errorDetails.code,
      errorCode: result.errorDetails.errorCode,
      translationOutcome: result.errorDetails.translationOutcome,
    });
    expect(response.error.context).toBe(message.context);
    expect(response.errorDetails).toMatchObject({
      ...result.errorDetails,
      context: message.context,
    });
    expect(response.errorDetails).not.toHaveProperty('translatedText');
  });

  it('normalizes errorDetails-only results through createErrorResponse', async () => {
    const result = {
      success: false,
      errorDetails: {
        message: 'API key invalid',
        type: ErrorTypes.API_KEY_INVALID,
        statusCode: 401,
        providerName: 'Provider',
      },
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    const response = await handleTranslate(message, {});

    expect(response).toMatchObject({
      success: false,
      error: result.errorDetails,
      errorDetails: result.errorDetails,
      messageId: message.messageId,
    });
  });

  it('falls back to legacy error when errorDetails is malformed', async () => {
    const result = {
      success: false,
      error: {
        message: 'legacy failure',
        type: ErrorTypes.NETWORK_ERROR,
      },
      errorDetails: { arbitrary: true },
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error: result.error,
    });
  });

  it('preserves success:false behavior when no usable error source exists', async () => {
    const result = { success: false };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleTranslate(message, {})).resolves.toBe(result);
  });

  it('returns successful results unchanged', async () => {
    const result = { success: true, translatedText: 'Bonjour' };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleTranslate(message, {})).resolves.toBe(result);
  });

  it('keeps thrown errors on the existing formatting path', async () => {
    const error = Object.assign(new Error('Engine failed'), {
      type: ErrorTypes.SERVER_ERROR,
      statusCode: 503,
      providerName: 'Provider',
    });
    unifiedTranslationService.handleTranslationRequest.mockRejectedValueOnce(error);

    await expect(handleTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error: {
        message: 'Engine failed',
        type: ErrorTypes.SERVER_ERROR,
        statusCode: 503,
        providerName: 'Provider',
      },
      messageId: message.messageId,
    });
    expect(handleError).toHaveBeenCalledWith(error, expect.objectContaining({
      type: ErrorTypes.TRANSLATION,
      context: 'handleTranslate',
    }));
  });
});
