import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMessage, sendRegularMessage } from './UnifiedMessaging.js';
import browser from 'webextension-polyfill';
import ExtensionContextManager from '@/core/extensionContext.js';
import * as contextCore from '@/core/contextCore.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

// Mock dependencies
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: vi.fn(),
      getURL: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue({}),
        remove: vi.fn().mockResolvedValue({})
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn()
      }
    }
  }
}));

vi.mock('@/core/contextCore.js', () => ({
  isValidSync: vi.fn().mockReturnValue(true),
  isContextError: vi.fn().mockReturnValue(false),
  contextState: { isInvalidated: false, notificationShown: false },
  getActiveEnvironment: vi.fn().mockReturnValue('popup'),
  ENVIRONMENTS: {
    BACKGROUND: 'background',
    CONTENT: 'content',
    POPUP: 'popup',
    SIDEPANEL: 'sidepanel',
    OPTIONS: 'options',
    OFFSCREEN: 'offscreen'
  }
}));

vi.mock('@/core/extensionContext.js', () => {
  const mock = {
    isValidSync: vi.fn().mockReturnValue(true),
    isContextError: vi.fn().mockReturnValue(false),
    handleContextError: vi.fn(),
    safeSendMessage: vi.fn().mockResolvedValue({ success: true }),
    isExtensionContextValid: vi.fn().mockReturnValue(true),
  };
  return {
    default: mock,
    ...mock
  };
});

vi.mock('./UnifiedTranslationCoordinator.js', () => ({
  unifiedTranslationCoordinator: {
    coordinateTranslation: vi.fn()
  }
}));

vi.mock('./StreamingTimeoutManager.js', () => ({
  streamingTimeoutManager: {
    shouldContinue: vi.fn().mockReturnValue(true),
    getOperationState: vi.fn().mockReturnValue(null)
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn()
  })
}));

// Mock ErrorHandler using central mocks
vi.mock('@/shared/error-management/ErrorHandler.js');

describe('UnifiedMessaging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    contextCore.isValidSync.mockReturnValue(true);
    ExtensionContextManager.isValidSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('sendRegularMessage', () => {
    it('should send a message and return the response on success', async () => {
      const message = { action: 'PING', messageId: '1' };
      const expectedResponse = { success: true, data: 'pong' };
      browser.runtime.sendMessage.mockResolvedValue(expectedResponse);

      const promise = sendRegularMessage(message);
      const response = await promise;

      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(message);
      expect(response).toEqual(expectedResponse);
    });

    it('should throw an error if the operation times out', async () => {
      const message = { action: 'PING', messageId: 'timeout-test' };
      browser.runtime.sendMessage.mockReturnValue(new Promise(() => {})); // Never resolves

      const promise = sendRegularMessage(message, { timeout: 100 });
      
      vi.advanceTimersByTime(150);
      
      await expect(promise).rejects.toThrow(/timed out/);
    });

    it('should throw an error if response.success is false', async () => {
      const message = { action: 'FAIL', messageId: '2' };
      browser.runtime.sendMessage.mockResolvedValue({ 
        success: false, 
        error: { message: 'Something went wrong', type: 'API_ERROR' } 
      });

      await expect(sendRegularMessage(message)).rejects.toThrow('Something went wrong');
    });

    it('reconstructs canonical error identity and drops transport metadata', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        message: 'envelope message',
        type: 'ENVELOPE_TYPE',
        statusCode: 418,
        messageId: 'response-id',
        streaming: true,
        translatedText: 'leak',
        provider: 'top-level-provider',
        sourceLanguage: 'en',
        targetLanguage: 'fa',
        error: {
          message: 'canonical message',
          type: 'API_ERROR',
          originalType: 'HTTP_ERROR',
          statusCode: 503,
          context: 'translation',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'UPSTREAM_FAILURE',
          errorCode: 'E_UPSTREAM',
          translationOutcome: { committedParentCount: 1 },
          isFatal: true,
          cancelled: true,
          alreadyHandled: true,
          cause: new Error('unsafe cause'),
          originalError: { message: 'unsafe original' },
          stack: 'unsafe stack',
          arbitrary: { secret: true }
        }
      });

      const rejection = sendRegularMessage({ action: 'TRANSLATE' });
      await expect(rejection).rejects.toThrow('canonical message');
      try {
        await rejection;
      } catch (error) {
        expect(error).toMatchObject({
          message: 'canonical message',
          type: 'API_ERROR',
          originalType: 'HTTP_ERROR',
          statusCode: 503,
          context: 'translation',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'UPSTREAM_FAILURE',
          errorCode: 'E_UPSTREAM',
          translationOutcome: { committedParentCount: 1 }
        });
        expect(error).not.toHaveProperty('success');
        expect(error).not.toHaveProperty('messageId');
        expect(error).not.toHaveProperty('streaming');
        expect(error).not.toHaveProperty('translatedText');
        expect(error).not.toHaveProperty('provider');
        expect(error).not.toHaveProperty('sourceLanguage');
        expect(error).not.toHaveProperty('targetLanguage');
        expect(error).not.toHaveProperty('isFatal');
        expect(error).not.toHaveProperty('cancelled');
        expect(error).not.toHaveProperty('isCancelled');
        expect(error).not.toHaveProperty('alreadyHandled');
        expect(error).not.toHaveProperty('cause');
        expect(error).not.toHaveProperty('originalError');
        expect(error).not.toHaveProperty('arbitrary');
      }
    });

    it('keeps canonical error fields authoritative over conflicting envelope fields', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        message: 'wrong envelope message',
        type: 'WRONG_ENVELOPE_TYPE',
        statusCode: 401,
        error: {
          message: 'canonical message',
          type: 'API_ERROR',
          statusCode: 503
        }
      });

      const rejection = sendRegularMessage({ action: 'FAIL' });
      await expect(rejection).rejects.toThrow('canonical message');
      await rejection.catch((error) => {
        expect(error.message).toBe('canonical message');
        expect(error.type).toBe('API_ERROR');
        expect(error.statusCode).toBe(503);
      });
    });

    it('reconstructs string response errors', async () => {
      browser.runtime.sendMessage.mockResolvedValue({ success: false, error: 'String failure' });

      await expect(sendRegularMessage({ action: 'FAIL' })).rejects.toThrow('String failure');
    });

    it('reconstructs top-level errorDetails when legacy error is a string', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'raw legacy provider message',
        errorDetails: {
          message: 'canonical message',
          type: 'MODEL_NOT_FOUND',
          originalType: 'PROVIDER_ERROR',
          statusCode: 404,
          context: 'translate-text',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'MODEL_MISSING',
          errorCode: 'E_MODEL',
          translationOutcome: { partial: true },
          arbitrary: { ignored: true }
        }
      });

      const rejection = sendRegularMessage({ action: 'TRANSLATE_TEXT' });
      await expect(rejection).rejects.toThrow('canonical message');
      await rejection.catch((error) => {
        expect(error).toMatchObject({
          message: 'canonical message',
          type: 'MODEL_NOT_FOUND',
          originalType: 'PROVIDER_ERROR',
          statusCode: 404,
          context: 'translate-text',
          providerName: 'Provider',
          providerId: 'provider-id',
          code: 'MODEL_MISSING',
          errorCode: 'E_MODEL',
          translationOutcome: { partial: true }
        });
        expect(error.message).not.toBe('raw legacy provider message');
        expect(error).not.toHaveProperty('arbitrary');
      });
    });

    it('reconstructs errorDetails when no legacy error is present', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        errorDetails: {
          message: 'canonical failure',
          type: 'NETWORK_ERROR',
          statusCode: 503
        }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: 'canonical failure',
        type: 'NETWORK_ERROR',
        statusCode: 503
      });
    });

    it('keeps canonical errorDetails authoritative over structured response.error', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: {
          message: 'response error',
          type: 'RESPONSE_ERROR',
          statusCode: 400
        },
        errorDetails: {
          message: 'secondary details',
          type: 'DETAILS_ERROR',
          statusCode: 500,
          providerName: 'Provider',
          translationOutcome: { partial: true }
        }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: 'secondary details',
        type: 'DETAILS_ERROR',
        statusCode: 500,
        providerName: 'Provider',
        translationOutcome: { partial: true }
      });
    });

    it('preserves an empty canonical errorDetails message over legacy error', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: { message: 'legacy failure', type: 'LEGACY_ERROR' },
        errorDetails: { message: '', type: 'PROVIDER_ERROR' }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: '',
        type: 'PROVIDER_ERROR'
      });
    });

    it('preserves an empty message in details-only failures', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        errorDetails: { message: '', type: 'PROVIDER_ERROR' }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: '',
        type: 'PROVIDER_ERROR'
      });
    });

    it('preserves an empty message from an object-valued legacy error', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: { message: '', type: 'PROVIDER_ERROR' }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: '',
        type: 'PROVIDER_ERROR'
      });
    });

    it('falls back to legacy error when errorDetails is malformed', async () => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        error: 'legacy failure',
        errorDetails: { arbitrary: true }
      });

      await expect(sendRegularMessage({ action: 'TRANSLATE_TEXT' })).rejects.toMatchObject({
        message: 'legacy failure'
      });
    });

    it.each([
      ['object error', { error: 'nested error' }, 'nested error'],
      ['object reason', { reason: 'reason failure' }, 'reason failure'],
      ['object statusText', { statusText: 'status failure' }, 'status failure'],
      ['top-level message', {}, 'top-level failure', { message: 'top-level failure' }],
      ['top-level statusText', {}, 'status failure', { statusText: 'status failure' }]
    ])('preserves %s message fallback', async (_name, error, expected, envelope = {}) => {
      browser.runtime.sendMessage.mockResolvedValue({
        success: false,
        ...envelope,
        error
      });

      await expect(sendRegularMessage({ action: 'FAIL' })).rejects.toThrow(expected);
    });

    it('uses technical fallback for missing or malformed errors', async () => {
      browser.runtime.sendMessage
        .mockResolvedValueOnce({
          success: false,
          error: { arbitrary: { nested: true }, partialResults: ['unsafe'] }
        })
        .mockResolvedValueOnce({ success: false });

      const malformedRejection = sendRegularMessage({ action: 'FAIL' });
      await expect(malformedRejection).rejects.toThrow('Unknown technical error');
      await malformedRejection.catch((error) => {
        expect(error).not.toHaveProperty('arbitrary');
        expect(error).not.toHaveProperty('partialResults');
      });

      await expect(sendRegularMessage({ action: 'FAIL' })).rejects.toThrow('Unknown technical error');
    });

    it('returns restricted-page failures unchanged', async () => {
      const response = {
        success: false,
        isRestrictedPage: true,
        error: { message: 'restricted' },
        arbitrary: { preserved: true }
      };
      browser.runtime.sendMessage.mockResolvedValue(response);

      await expect(sendRegularMessage({ action: 'FAIL' })).resolves.toBe(response);
    });

    it('leaves rejected runtime errors unchanged', async () => {
      const runtimeError = Object.assign(new Error('Runtime failed'), {
        type: 'RUNTIME_ERROR',
        arbitrary: { preserved: true }
      });
      browser.runtime.sendMessage.mockRejectedValue(runtimeError);

      await expect(sendRegularMessage({ action: 'FAIL' })).rejects.toBe(runtimeError);
    });

    it('maps explicit cancelled lifecycle state to USER_CANCELLED before sending', async () => {
      const { streamingTimeoutManager } = await import('./StreamingTimeoutManager.js');
      streamingTimeoutManager.shouldContinue.mockReturnValue(false);
      streamingTimeoutManager.getOperationState.mockReturnValue({
        isCancelled: true,
        hasTimedOut: false,
        isCompleted: false
      });

      try {
        await expect(sendRegularMessage({ action: 'TRANSLATE', messageId: 'cancelled' }))
          .rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
        expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
        streamingTimeoutManager.getOperationState.mockReturnValue(null);
      }
    });

    it('maps explicit timed-out lifecycle state to TRANSLATION_TIMEOUT before sending', async () => {
      const { streamingTimeoutManager } = await import('./StreamingTimeoutManager.js');
      streamingTimeoutManager.shouldContinue.mockReturnValue(false);
      streamingTimeoutManager.getOperationState.mockReturnValue({
        isCancelled: false,
        hasTimedOut: true,
        isCompleted: false
      });

      try {
        await expect(sendRegularMessage({ action: 'TRANSLATE', messageId: 'timed-out' }))
          .rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
        expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
        streamingTimeoutManager.getOperationState.mockReturnValue(null);
      }
    });

    it('does not fabricate terminal identity for unknown lifecycle state', async () => {
      const { streamingTimeoutManager } = await import('./StreamingTimeoutManager.js');
      streamingTimeoutManager.shouldContinue.mockReturnValue(false);
      streamingTimeoutManager.getOperationState.mockReturnValue(null);
      const response = { success: true, data: 'continued' };
      browser.runtime.sendMessage.mockResolvedValue(response);

      try {
        await expect(sendRegularMessage({ action: 'TRANSLATE', messageId: 'unknown-state' }))
          .resolves.toBe(response);
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
      }
    });

    it('maps explicit timed-out lifecycle state during polling', async () => {
      const { streamingTimeoutManager } = await import('./StreamingTimeoutManager.js');
      streamingTimeoutManager.shouldContinue
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      streamingTimeoutManager.getOperationState.mockReturnValue({
        isCancelled: false,
        hasTimedOut: true,
        isCompleted: false
      });
      browser.runtime.sendMessage.mockReturnValue(new Promise(() => {}));

      try {
        const promise = sendRegularMessage({ action: 'TRANSLATE', messageId: 'poll-timeout' });
        const expectation = expect(promise).rejects.toMatchObject({ type: ErrorTypes.TRANSLATION_TIMEOUT });
        await vi.advanceTimersByTimeAsync(50);

        await expectation;
      } finally {
        streamingTimeoutManager.shouldContinue.mockReturnValue(true);
        streamingTimeoutManager.getOperationState.mockReturnValue(null);
      }
    });

    it('should throw if extension context is invalidated', async () => {
      contextCore.isValidSync.mockReturnValue(false);
      const message = { action: 'PING' };

      await expect(sendRegularMessage(message)).rejects.toThrow('Extension context invalidated');
    });
  });

  describe('sendMessage (Unified Routing)', () => {
    it('should route non-translation actions directly to sendRegularMessage', async () => {
      const message = { action: 'GET_SETTINGS' };
      browser.runtime.sendMessage.mockResolvedValue({ success: true });

      await sendMessage(message);

      expect(browser.runtime.sendMessage).toHaveBeenCalled();
    });

    it('preserves typed user cancellation from the coordinator', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      const cancellation = Object.assign(new Error('Translation cancelled by user'), {
        type: ErrorTypes.USER_CANCELLED,
      });
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(cancellation);

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'cancelled' }))
        .rejects.toBe(cancellation);
      expect(browser.runtime.sendMessage).not.toHaveBeenCalled();
    });

    it('does not fabricate cancellation for a generic coordinator failure', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      const { streamingTimeoutManager } = await import('./StreamingTimeoutManager.js');
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(new Error('generic failure'));
      streamingTimeoutManager.shouldContinue.mockReturnValue(true);
      browser.runtime.sendMessage.mockResolvedValue({ success: true, fallback: true });

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'completed' }))
        .resolves.toMatchObject({ success: true, fallback: true });
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: expect.stringMatching(/^fb-/) })
      );
    });

    it('probes status and falls back for typed TRANSLATION_TIMEOUT', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      const timeout = Object.assign(new Error('Translation timed out'), {
        type: ErrorTypes.TRANSLATION_TIMEOUT,
      });
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(timeout);
      browser.runtime.sendMessage
        .mockResolvedValueOnce({ completed: false })
        .mockResolvedValueOnce({ success: true, recovered: true });

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'timeout' }))
        .resolves.toMatchObject({ success: true, recovered: true });
      expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
        action: 'CHECK_TRANSLATION_STATUS',
        data: { messageId: 'timeout' }
      });
    });

    it('probes status and falls back for typed OPERATION_TIMEOUT', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      const timeout = Object.assign(new Error('Operation timed out'), {
        type: ErrorTypes.OPERATION_TIMEOUT,
      });
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(timeout);
      browser.runtime.sendMessage
        .mockResolvedValueOnce({ completed: false })
        .mockResolvedValueOnce({ success: true, recovered: true });

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'operation-timeout' }))
        .resolves.toMatchObject({ success: true, recovered: true });
      expect(browser.runtime.sendMessage).toHaveBeenNthCalledWith(1, {
        action: 'CHECK_TRANSLATION_STATUS',
        data: { messageId: 'operation-timeout' }
      });
    });

    it('does not probe status for explicit NETWORK_ERROR timeout wording', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      const networkError = Object.assign(new Error('upstream request timed out'), {
        type: ErrorTypes.NETWORK_ERROR,
      });
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(networkError);
      browser.runtime.sendMessage.mockResolvedValue({ success: true, recovered: true });

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'network-timeout-wording' }))
        .resolves.toMatchObject({ success: true, recovered: true });
      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.runtime.sendMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHECK_TRANSLATION_STATUS' })
      );
    });

    it('probes status for an untyped legacy timeout', async () => {
      const { unifiedTranslationCoordinator } = await import('./UnifiedTranslationCoordinator.js');
      unifiedTranslationCoordinator.coordinateTranslation.mockRejectedValueOnce(
        new Error('Translation timed out')
      );
      browser.runtime.sendMessage.mockResolvedValueOnce({
        completed: true,
        results: ['recovered']
      });

      await expect(sendMessage({ action: 'TRANSLATE', messageId: 'legacy-timeout' }))
        .resolves.toEqual(['recovered']);
      expect(browser.runtime.sendMessage).toHaveBeenCalledTimes(1);
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'CHECK_TRANSLATION_STATUS',
        data: { messageId: 'legacy-timeout' }
      });
    });
  });
});
