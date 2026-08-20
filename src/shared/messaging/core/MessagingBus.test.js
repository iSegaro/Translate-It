import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagingBus } from './MessagingBus.js';
import { sendMessage } from './UnifiedMessaging.js';

vi.mock('./UnifiedMessaging.js', () => ({
  sendMessage: vi.fn()
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    error: vi.fn()
  })
}));

describe('MessagingBus.sendToBackground error details', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ['ordinary Error', new Error('failed')],
    ['typed Error', Object.assign(new Error('invalid key'), { type: 'API_KEY_INVALID' })],
    ['plain object with message', { message: 'plain failure' }],
    ['plain object without message', { reason: 'missing message' }],
    ['string', 'string failure'],
    ['number', 42],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined]
  ])('normalizes %s rejection into one canonical failure envelope', async (_label, rejection) => {
    sendMessage.mockRejectedValueOnce(rejection);

    const response = await MessagingBus.sendToBackground({ action: 'TEST_ACTION' });

    expect(response).toMatchObject({
      success: false,
      errorDetails: expect.any(Object)
    });

    expect(response.error).toBe(response.errorDetails.message);
  });

  it('keeps legacy message and adds serializer fallback identity', async () => {
    sendMessage.mockRejectedValueOnce(new Error('failed'));

    await expect(MessagingBus.sendToBackground({ action: 'TEST_ACTION' })).resolves.toEqual({
      success: false,
      error: 'failed',
      errorDetails: {
        message: 'failed',
        type: 'TRANSLATION_ERROR'
      }
    });
  });

  it('preserves canonical typed identity', async () => {
    const error = Object.assign(new Error('invalid key'), {
      type: 'API_KEY_INVALID'
    });
    sendMessage.mockRejectedValueOnce(error);

    await expect(MessagingBus.sendToBackground({ action: 'TEST_ACTION' })).resolves.toMatchObject({
      success: false,
      error: 'invalid key',
      errorDetails: {
        message: 'invalid key',
        type: 'API_KEY_INVALID'
      }
    });
  });

  it('preserves supported canonical fields and excludes unsafe fields', async () => {
    const error = Object.assign(new Error('provider failed'), {
      type: 'PROVIDER_ERROR',
      originalType: 'HTTP_ERROR',
      statusCode: 503,
      providerName: 'Provider',
      providerId: 'provider-id',
      code: 'UPSTREAM_FAILURE',
      errorCode: 'E_UPSTREAM',
      translationOutcome: { partial: true },
      arbitrary: 'unsafe',
      cause: new Error('internal')
    });
    sendMessage.mockRejectedValueOnce(error);

    const response = await MessagingBus.sendToBackground({ action: 'TEST_ACTION' });

    expect(response).toEqual({
      success: false,
      error: 'provider failed',
      errorDetails: {
        message: 'provider failed',
        type: 'PROVIDER_ERROR',
        originalType: 'HTTP_ERROR',
        statusCode: 503,
        providerName: 'Provider',
        providerId: 'provider-id',
        code: 'UPSTREAM_FAILURE',
        errorCode: 'E_UPSTREAM',
        translationOutcome: { partial: true }
      }
    });
    expect(response.errorDetails).not.toHaveProperty('arbitrary');
    expect(response.errorDetails).not.toHaveProperty('cause');
  });

  it.each([
    ['context invalidation', 'Extension context invalidated', 'EXTENSION_CONTEXT_INVALIDATED'],
    ['cancellation', 'Translation cancelled', 'USER_CANCELLED'],
    ['timeout', 'Translation timed out', 'TRANSLATION_TIMEOUT']
  ])('preserves %s identity', async (_label, message, type) => {
    sendMessage.mockRejectedValueOnce(Object.assign(new Error(message), { type }));

    await expect(MessagingBus.sendToBackground({ action: 'TEST_ACTION' })).resolves.toMatchObject({
      success: false,
      error: message,
      errorDetails: { message, type }
    });
  });
});
