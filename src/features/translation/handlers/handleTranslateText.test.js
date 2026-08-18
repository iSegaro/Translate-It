import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTranslateText } from './handleTranslateText.js';
import { unifiedTranslationService } from '@/core/services/translation/UnifiedTranslationService.js';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), error: vi.fn() })
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: class {
    handle = vi.fn();
  }
}));

vi.mock('@/core/services/translation/UnifiedTranslationService.js', () => ({
  unifiedTranslationService: {
    handleTranslationRequest: vi.fn()
  }
}));

describe('handleTranslateText', () => {
  const message = {
    action: 'TRANSLATE_TEXT',
    messageId: 'msg-1',
    data: { text: 'Hello', from: 'en', to: 'fa' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('backgroundService', { translationEngine: {} });
  });

  it('keeps legacy error string and adds sanitized canonical identity', async () => {
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: {
        message: 'Provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        context: 'translate-text',
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true },
        cause: 'private',
        arbitrary: { ignored: true }
      }
    });

    const response = await handleTranslateText(message);

    expect(response).toMatchObject({ success: false, error: 'Provider failed' });
    expect(response.errorDetails).toMatchObject({
      message: 'Provider failed',
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      context: 'translate-text',
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true }
    });
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('keeps string-only result failures compatible', async () => {
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: false,
      error: 'legacy failure'
    });

    const response = await handleTranslateText(message);

    expect(response).toEqual({
      success: false,
      error: 'Translation failed',
      errorDetails: { message: 'Translation failed' }
    });
  });

  it('adds canonical identity to catch failures without changing message', async () => {
    const error = new Error('Transport failed');
    error.type = 'NETWORK_ERROR';
    error.statusCode = 503;
    error.providerName = 'Provider';
    error.cause = 'private';
    error.arbitrary = { ignored: true };
    unifiedTranslationService.handleTranslationRequest.mockRejectedValue(error);

    const response = await handleTranslateText(message);

    expect(response.error).toBe('Transport failed');
    expect(response.errorDetails).toMatchObject({
      message: 'Transport failed',
      type: 'NETWORK_ERROR',
      statusCode: 503,
      providerName: 'Provider'
    });
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
  });

  it('keeps success response unchanged', async () => {
    unifiedTranslationService.handleTranslationRequest.mockResolvedValue({
      success: true,
      translatedText: 'سلام',
      provider: 'Provider',
      sourceLanguage: 'en',
      targetLanguage: 'fa'
    });

    await expect(handleTranslateText(message)).resolves.toEqual({
      success: true,
      translation: 'سلام',
      provider: 'Provider',
      sourceLanguage: 'en',
      targetLanguage: 'fa'
    });
  });
});
