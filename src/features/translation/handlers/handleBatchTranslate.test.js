import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBatchTranslate } from './handleBatchTranslate.js';
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

describe('handleBatchTranslate failure routing', () => {
  const message = {
    action: 'BATCH_TRANSLATE',
    messageId: 'batch-message',
    context: 'subtitle-translation',
    data: { items: [{ id: 'cue-1', text: 'Hello' }] },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.backgroundService = { translationEngine: {} };
  });

  it('keeps legacy structured errors normalized', async () => {
    const error = {
      message: 'Provider failed',
      type: 'PROVIDER_ERROR',
      statusCode: 503,
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      error,
    });

    await expect(handleBatchTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error,
      messageId: message.messageId,
    });
  });

  it('prefers canonical errorDetails over conflicting legacy error', async () => {
    const errorDetails = {
      message: 'canonical failure',
      type: 'HTTP_ERROR',
      statusCode: 503,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true },
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
      errorDetails,
      translatedText: '[{"text":"Hello"}]',
      actualCharCount: 0,
      originalCharCount: 5,
      hasError: true,
      isFatal: false,
    });

    const response = await handleBatchTranslate(message, {});

    expect(response.error).toMatchObject(errorDetails);
    expect(response.error.context).toBe(message.context);
    expect(response.error).not.toHaveProperty('errorDetails');
  });

  it('formats errorDetails-only failures', async () => {
    const errorDetails = {
      message: 'API key invalid',
      type: ErrorTypes.API_KEY_INVALID,
      statusCode: 401,
      providerName: 'Provider',
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      errorDetails,
    });

    await expect(handleBatchTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error: errorDetails,
      messageId: message.messageId,
    });
  });

  it('falls back to legacy error when errorDetails is malformed', async () => {
    const error = { message: 'legacy failure', type: 'NETWORK_ERROR' };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      error,
      errorDetails: { arbitrary: true },
    });

    await expect(handleBatchTranslate(message, {})).resolves.toMatchObject({
      success: false,
      error,
    });
  });

  it('returns failure results without a usable source unchanged', async () => {
    const result = { success: false };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleBatchTranslate(message, {})).resolves.toBe(result);
  });

  it('returns successful results unchanged', async () => {
    const result = {
      success: true,
      results: [{ id: 'cue-1', text: 'Bonjour' }],
    };
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce(result);

    await expect(handleBatchTranslate(message, {})).resolves.toBe(result);
  });

  it('keeps thrown errors on the existing formatting path', async () => {
    const error = Object.assign(new Error('Engine failed'), {
      type: ErrorTypes.SERVER_ERROR,
      statusCode: 503,
      providerName: 'Provider',
    });
    unifiedTranslationService.handleTranslationRequest.mockRejectedValueOnce(error);

    await expect(handleBatchTranslate(message, {})).resolves.toMatchObject({
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
      context: 'handleBatchTranslate',
    }));
  });

  it('preserves forwarded batch metadata without nesting canonical details', async () => {
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      error: 'legacy failure',
      errorDetails: { message: 'canonical failure', type: 'PROVIDER_ERROR' },
      translatedText: '[{"text":"Hello"}]',
      actualCharCount: 0,
      originalCharCount: 5,
      hasError: true,
      isFatal: true,
      batchMetadata: { batchIndex: 2 },
    });

    const response = await handleBatchTranslate(message, {});

    expect(response.error).toMatchObject({
      translatedText: '[{"text":"Hello"}]',
      actualCharCount: 0,
      originalCharCount: 5,
      hasError: true,
      isFatal: true,
      batchMetadata: { batchIndex: 2 },
    });
    expect(response.error).not.toHaveProperty('errorDetails');
  });

  it('keeps request context as canonical error context', async () => {
    unifiedTranslationService.handleTranslationRequest.mockResolvedValueOnce({
      success: false,
      error: { message: 'failed', type: 'PROVIDER_ERROR', context: 'provider-context' },
    });

    const response = await handleBatchTranslate(message, {});

    expect(response.error.context).toBe(message.context);
  });
});
