import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IFrameManager } from './IFrameManager.js';
import { MessageFormat } from '@/shared/messaging/core/MessagingCore.js';

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn(),
}));

vi.mock('@/shared/messaging/core/UnifiedMessaging.js', () => ({ sendMessage }));

describe('IFrameManager._handleTranslationRequest', () => {
  let manager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = Object.create(IFrameManager.prototype);
    manager.errorHandler = { handle: vi.fn().mockResolvedValue(undefined) };
  });

  it('preserves canonical translation identity while retaining legacy error string', async () => {
    const error = Object.assign(new Error('raw provider diagnostic'), {
      type: 'MODEL_NOT_FOUND',
      originalType: 'PROVIDER_ERROR',
      statusCode: 404,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'MODEL_MISSING',
      errorCode: 'E_MODEL',
      translationOutcome: { partial: true },
      cause: new Error('internal cause'),
      rollbackFailures: [{ error: new Error('rollback failure') }],
      arbitrary: 'internal value',
    });
    sendMessage.mockRejectedValueOnce(error);

    const response = await manager._handleTranslationRequest({ text: 'hello' });

    expect(response.success).toBe(false);
    expect(response.error).toBe('raw provider diagnostic');
    expect(response.errorDetails).toEqual({
      ...MessageFormat.serializeTranslationError(error),
    });
    expect(response.errorDetails).toMatchObject({
      message: 'raw provider diagnostic',
      type: 'MODEL_NOT_FOUND',
      originalType: 'PROVIDER_ERROR',
      statusCode: 404,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'MODEL_MISSING',
      errorCode: 'E_MODEL',
      translationOutcome: { partial: true },
    });
    expect(response.errorDetails).not.toHaveProperty('stack');
    expect(response.errorDetails).not.toHaveProperty('cause');
    expect(response.errorDetails).not.toHaveProperty('rollbackFailures');
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
    expect(manager.errorHandler.handle).toHaveBeenCalledWith(error, {
      context: 'iframe-translation-request',
      showToast: false,
    });
  });

  it('keeps ordinary Error failures compatible', async () => {
    sendMessage.mockRejectedValueOnce(new Error('ordinary failure'));

    await expect(manager._handleTranslationRequest({ text: 'hello' })).resolves.toMatchObject({
      success: false,
      error: 'ordinary failure',
      errorDetails: {
        message: 'ordinary failure',
      },
    });
  });

  it('does not change successful response shape', async () => {
    const response = { success: true, translatedText: 'hola' };
    sendMessage.mockResolvedValueOnce(response);

    await expect(manager._handleTranslationRequest({ text: 'hello' })).resolves.toBe(response);
    expect(manager.errorHandler.handle).not.toHaveBeenCalled();
  });
});
