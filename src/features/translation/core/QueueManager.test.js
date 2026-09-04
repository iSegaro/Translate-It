import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

const loggerMock = vi.hoisted(() => ({
  init: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

// Mock extension polyfill
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => loggerMock,
}));

describe('QueueManager', () => {
  let queueManager;

  const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    return { promise, resolve, reject };
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.resetModules();
    
    const mod = await import('./QueueManager.js');
    queueManager = mod.queueManager;
    
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // Predictable jitter (0.75x)
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should be a singleton', async () => {
    const { QueueManager } = await import('./QueueManager.js');
    const instance1 = new QueueManager();
    const instance2 = new QueueManager();
    expect(instance1).toBe(instance2);
  });

  describe('Enqueue and Execution', () => {
    it('should execute a request immediately if queue is empty', async () => {
      const mockRequest = vi.fn().mockResolvedValue('Success');
      const promise = queueManager.enqueue('test-provider', mockRequest);
      
      await vi.advanceTimersByTimeAsync(150); // Buffer for loop
      
      const result = await promise;
      expect(result).toBe('Success');
      expect(mockRequest).toHaveBeenCalledTimes(1);
    });

    it('should process items in priority order', async () => {
      const results = [];
      const createRequest = (id, delay) => async () => {
        await new Promise(resolve => setTimeout(resolve, delay));
        results.push(id);
        return id;
      };

      const p1 = queueManager.enqueue('test-provider', createRequest('low', 100), 0);
      await vi.advanceTimersByTimeAsync(150); 
      
      const p2 = queueManager.enqueue('test-provider', createRequest('high', 10), 10);
      const p3 = queueManager.enqueue('test-provider', createRequest('medium', 10), 5);

      await vi.advanceTimersByTimeAsync(200);
      await p1;

      await vi.advanceTimersByTimeAsync(200);
      await Promise.all([p2, p3]);

      expect(results).toEqual(['low', 'high', 'medium']);
    });
  });

  describe('Retry Logic', () => {
    it('settles user cancellation immediately during retry wait', async () => {
      const controller = new AbortController();
      const retryAt = Date.now() + 60_000;
      const request = vi.fn().mockRejectedValue({
        type: ErrorTypes.RATE_LIMIT_REACHED,
        message: 'rate limited',
        retryAt,
      });
      const promise = queueManager.enqueue('retry-cancel-provider', request, 0, 'unknown', {
        abortController: controller,
      });

      await vi.advanceTimersByTimeAsync(150);
      const item = queueManager.queues.get('retry-cancel-provider')[0];
      expect(item.status).toBe('retrying');
      expect(queueManager.retryTimeouts.has(item.id)).toBe(true);

      controller.abort('user-cancelled');

      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      expect(queueManager.retryTimeouts.has(item.id)).toBe(false);
      expect(queueManager.queues.get('retry-cancel-provider')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(request).toHaveBeenCalledOnce();
    });

    it('settles internal abort immediately during retry wait', async () => {
      const controller = new AbortController();
      const request = vi.fn().mockRejectedValue({
        type: ErrorTypes.RATE_LIMIT_REACHED,
        message: 'rate limited',
        retryAt: Date.now() + 60_000,
      });
      const promise = queueManager.enqueue('retry-operation-abort-provider', request, 0, 'unknown', {
        abortController: controller,
      });

      await vi.advanceTimersByTimeAsync(150);
      const item = queueManager.queues.get('retry-operation-abort-provider')[0];
      controller.abort('operation-abort');

      await expect(promise).rejects.toMatchObject({
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });
      expect(queueManager.retryTimeouts.has(item.id)).toBe(false);
      expect(queueManager.queues.get('retry-operation-abort-provider')).toHaveLength(0);
      expect(request).toHaveBeenCalledOnce();
    });

    it('does not claim a strategy denominator for initial processing', async () => {
      const request = vi.fn().mockResolvedValue('Success');
      const promise = queueManager.enqueue('initial-attempt-provider', request);

      await vi.advanceTimersByTimeAsync(150);
      await promise;

      const processingLog = loggerMock.debug.mock.calls.find(([message]) => (
        message.startsWith('Processing item initial-attempt-provider-')
      ));
      expect(processingLog?.[0]).toMatch(/\(attempt 1\)$/);
      expect(processingLog?.[0]).not.toContain('attempt 1/');
    });

    it('logs retry scheduling as the next execution attempt', async () => {
      const networkError = { type: ErrorTypes.NETWORK_ERROR, message: 'network failure' };
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };
      const request = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce('Success');
      const promise = queueManager.enqueue('single-retry-observability-provider', request, 0, 'context', { executionContext });

      await vi.advanceTimersByTimeAsync(150);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      const processingLogs = loggerMock.debug.mock.calls
        .filter(([message]) => message.startsWith('Processing item single-retry-observability-provider-'))
        .map(([message]) => message);
      const retryLog = loggerMock.warn.mock.calls
        .find(([message]) => message.startsWith('Item single-retry-observability-provider-'));

      expect(processingLogs[0]).toMatch(/\(attempt 1\)$/);
      expect(processingLogs[1]).toMatch(/\(attempt 2\/4\)$/);
      expect(retryLog?.[0]).toMatch(/next attempt 2\/4/);
      expect(executionContext.operation.appendDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
        type: 'QUEUE_RETRY',
        attempt: 1,
      }));
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('uses current strategy denominator when error type changes', async () => {
      const networkError = { type: ErrorTypes.NETWORK_ERROR, message: 'network failure' };
      const serverError = { type: ErrorTypes.SERVER_ERROR, message: 'server failure' };
      const request = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce('Success');
      const promise = queueManager.enqueue('mixed-retry-observability-provider', request);
      const outcome = promise.then(
        value => ({ value }),
        error => ({ error }),
      );

      await vi.advanceTimersByTimeAsync(150);
      await vi.advanceTimersByTimeAsync(10000);
      await vi.advanceTimersByTimeAsync(10000);
      await expect(outcome).resolves.toEqual({ value: 'Success' });

      const processingLogs = loggerMock.debug.mock.calls
        .filter(([message]) => message.startsWith('Processing item mixed-retry-observability-provider-'))
        .map(([message]) => message);
      const retryLogs = loggerMock.warn.mock.calls
        .filter(([message]) => message.startsWith('Item mixed-retry-observability-provider-'))
        .map(([message]) => message);

      expect(processingLogs).toHaveLength(3);
      expect(processingLogs[0]).toMatch(/\(attempt 1\)$/);
      expect(processingLogs[1]).toMatch(/\(attempt 2\/4\)$/);
      expect(processingLogs[2]).toMatch(/\(attempt 3\/3\)$/);
      expect(retryLogs).toEqual([
        expect.stringMatching(/next attempt 2\/4/),
        expect.stringMatching(/next attempt 3\/3/),
      ]);
      expect(request).toHaveBeenCalledTimes(3);
    });

    it.each([429, 529])('should retry a RATE_LIMIT_REACHED request with exponential backoff for HTTP %s', async (statusCode) => {
      // RATE_LIMIT_REACHED: baseDelay 2000. Jittered (0.75x) = 1500ms.
      const mockError = { type: ErrorTypes.RATE_LIMIT_REACHED, statusCode, message: 'Rate limit' };
      
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockRejectedValueOnce(mockError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('retry-provider', mockRequest);

      // 1st attempt
      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      // Wait for 1st retry (1500ms + buffer)
      await vi.advanceTimersByTimeAsync(2000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      // Wait for 2nd retry (3000ms + buffer)
      await vi.advanceTimersByTimeAsync(4000);
      expect(mockRequest).toHaveBeenCalledTimes(3);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('uses request-local RATE_LIMIT_REACHED maxExecutions without changing generic strategy', async () => {
      const rateLimitError = { type: ErrorTypes.RATE_LIMIT_REACHED, message: 'Rate limit' };
      const request = vi.fn().mockRejectedValue(rateLimitError);
      const queueRetryPolicy = { maxExecutions: { RATE_LIMIT_REACHED: 3 } };
      const promise = queueManager.enqueue('configured-rate-limit-provider', request, 0, 'unknown', {
        queueRetryPolicy,
      });
      const outcome = promise.then(
        value => ({ value }),
        error => ({ error }),
      );
      promise.catch(() => {});

      queueRetryPolicy.maxExecutions.RATE_LIMIT_REACHED = 5;
      await vi.advanceTimersByTimeAsync(10000);

      await expect(outcome).resolves.toEqual({ error: rateLimitError });
      expect(request).toHaveBeenCalledTimes(3);

      const genericRequest = vi.fn()
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue('Success');
      const genericPromise = queueManager.enqueue('generic-rate-limit-provider', genericRequest);
      const genericOutcome = genericPromise.then(
        value => ({ value }),
        error => ({ error }),
      );
      genericPromise.catch(() => {});

      await vi.advanceTimersByTimeAsync(30000);
      await expect(genericOutcome).resolves.toEqual({ value: 'Success' });
      expect(genericRequest).toHaveBeenCalledTimes(5);
    });

    it.each([
      [ErrorTypes.SERVER_ERROR, 3],
      [ErrorTypes.NETWORK_ERROR, 4],
      [ErrorTypes.MODEL_OVERLOADED, 4],
      [ErrorTypes.TRANSLATION_TIMEOUT, 1],
      [ErrorTypes.OPERATION_TIMEOUT, 1],
    ])('keeps generic %s budget with a RATE_LIMIT_REACHED-only override', async (errorType, expectedExecutions) => {
      const error = { type: errorType, message: errorType };
      const request = vi.fn().mockRejectedValue(error);
      const promise = queueManager.enqueue(`unrelated-${errorType}`, request, 0, 'unknown', {
        queueRetryPolicy: { maxExecutions: { RATE_LIMIT_REACHED: 3 } },
      });
      const outcome = promise.then(
        value => ({ value }),
        error => ({ error }),
      );

      await vi.advanceTimersByTimeAsync(30000);
      await expect(outcome).resolves.toEqual({ error });
      expect(request).toHaveBeenCalledTimes(expectedExecutions);
    });

    it.each([ErrorTypes.TRANSLATION_TIMEOUT, ErrorTypes.OPERATION_TIMEOUT])(
      'does not retry terminal %s',
      async (timeoutType) => {
        const timeoutError = Object.assign(new Error(`${timeoutType} deadline`), {
          type: timeoutType,
        });
        const request = vi.fn().mockRejectedValue(timeoutError);
        const promise = queueManager.enqueue(`terminal-${timeoutType}`, request);

        await expect(promise).rejects.toBe(timeoutError);
        await vi.advanceTimersByTimeAsync(10000);

        expect(request).toHaveBeenCalledTimes(1);
        expect(queueManager.retryTimeouts.size).toBe(0);
        expect(queueManager.getQueueStatus(`terminal-${timeoutType}`).total).toBe(0);
      },
    );

    it('waits for Retry-After when it exceeds client retry delay', async () => {
      const retryableError = {
        type: ErrorTypes.RATE_LIMIT_REACHED,
        retryAt: Date.now() + 10000,
      };
      const request = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('Success');
      const promise = queueManager.enqueue('retry-after-provider', request);

      await vi.advanceTimersByTimeAsync(150);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(9849);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(promise).resolves.toBe('Success');
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('keeps client retry delay when Retry-After expires sooner', async () => {
      const retryableError = {
        type: ErrorTypes.RATE_LIMIT_REACHED,
        retryAt: Date.now() + 500,
      };
      const request = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('Success');
      const promise = queueManager.enqueue('short-retry-after-provider', request);

      await vi.advanceTimersByTimeAsync(150);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1349);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);

      await expect(promise).resolves.toBe('Success');
      expect(request).toHaveBeenCalledTimes(2);
    });

    it('does not retry earlier than a very long Retry-After', async () => {
      const retryableError = {
        type: ErrorTypes.RATE_LIMIT_REACHED,
        retryAt: Date.now() + 2_147_483_648,
      };
      const request = vi.fn()
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValue('Success');
      const promise = queueManager.enqueue('long-retry-after-provider', request);

      await vi.advanceTimersByTimeAsync(150);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(request).toHaveBeenCalledTimes(1);
      queueManager.cancelProvider('long-retry-after-provider');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });

    it('does not start a scheduled retry after operation abort', async () => {
      const abortController = new AbortController();
      const serverError = Object.assign(new Error('HTTP 500'), {
        type: ErrorTypes.SERVER_ERROR,
        statusCode: 500,
      });
      const request = vi.fn().mockRejectedValue(serverError);
      const promise = queueManager.enqueue('aborted-operation-provider', request, 0, 'select_element', {
        messageId: 'aborted-operation',
        abortController,
      });
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(150);
      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(1);

      abortController.abort('provider-fail-fast');
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      await expect(promise).rejects.toMatchObject({
        operationAborted: true,
        cancellationReason: 'operation-abort',
      });
    });

    it('detaches root circuit item before fail-fast abort reaches its signal', async () => {
      const abortController = new AbortController();
      const circuitError = Object.assign(new Error('Circuit open'), {
        type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
        originalType: ErrorTypes.SERVER_ERROR,
        statusCode: 500,
      });
      const request = vi.fn().mockRejectedValue(circuitError);
      const promise = queueManager.enqueue('root-circuit-provider', request, 0, 'select_element', {
        messageId: 'root-circuit-operation',
        abortController,
      });

      const rejection = await promise.catch((error) => error);
      expect(rejection).toMatchObject({
        type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
        originalType: ErrorTypes.SERVER_ERROR,
        statusCode: 500,
      });

      abortController.abort('provider-fail-fast');

      expect(rejection).not.toHaveProperty('operationAborted');
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('should fail permanently after max retries', async () => {
      const mockError = new Error('Network');
      mockError.type = ErrorTypes.NETWORK_ERROR;
      
      // NETWORK_ERROR: maxRetries 4.
      const mockRequest = vi.fn().mockRejectedValue(mockError);

      const promise = queueManager.enqueue('fail-provider', mockRequest);
      // Catch early to satisfy Vitest's unhandled rejection checker
      promise.catch(() => {});

      // Advance long enough for all retries
      for (let i = 0; i < 10; i++) {
        await vi.advanceTimersByTimeAsync(10000);
      }

      await expect(promise).rejects.toThrow('Network');
      expect(mockRequest).toHaveBeenCalledTimes(4);
    });

    it.each([
      ['mixed network/server', () => [
        Object.assign(new Error('Failed to fetch'), { type: ErrorTypes.NETWORK_ERROR }),
        Object.assign(new Error('HTTP 500'), { type: ErrorTypes.SERVER_ERROR, statusCode: 500 }),
        Object.assign(new Error('Circuit open'), {
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
        }),
      ], ErrorTypes.CIRCUIT_BREAKER_OPEN, ErrorTypes.SERVER_ERROR, 500],
      ['pure network', () => [
        Object.assign(new Error('Failed to fetch'), { type: ErrorTypes.NETWORK_ERROR }),
        Object.assign(new Error('Failed to fetch'), { type: ErrorTypes.NETWORK_ERROR }),
        Object.assign(new Error('Circuit open'), {
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.NETWORK_ERROR,
        }),
      ], ErrorTypes.CIRCUIT_BREAKER_OPEN, ErrorTypes.NETWORK_ERROR, undefined],
      ['pure server', () => [
        Object.assign(new Error('HTTP 500'), { type: ErrorTypes.SERVER_ERROR, statusCode: 500 }),
        Object.assign(new Error('HTTP 500'), { type: ErrorTypes.SERVER_ERROR, statusCode: 500 }),
        Object.assign(new Error('Circuit open'), {
          type: ErrorTypes.CIRCUIT_BREAKER_OPEN,
          originalType: ErrorTypes.SERVER_ERROR,
          statusCode: 500,
        }),
      ], ErrorTypes.CIRCUIT_BREAKER_OPEN, ErrorTypes.SERVER_ERROR, 500],
    ])('preserves operational circuit identity for %s', async (_label, createErrors, expectedType, expectedOriginalType, expectedStatus) => {
      const errors = createErrors();
      const request = vi.fn()
        .mockRejectedValueOnce(errors[0])
        .mockRejectedValueOnce(errors[1])
        .mockRejectedValueOnce(errors[2]);
      const promise = queueManager.enqueue('terminal-cause-provider', request);
      const rejection = promise.catch(error => error);

      await vi.advanceTimersByTimeAsync(10000);
      const terminalError = await rejection;
      expect(terminalError).toMatchObject({ type: expectedType, originalType: expectedOriginalType });
      expect(terminalError).not.toBe(errors[0]);
      if (expectedStatus === undefined) {
        expect(terminalError).not.toHaveProperty('statusCode');
      } else {
        expect(terminalError).toMatchObject({ statusCode: expectedStatus });
      }
      expect(request).toHaveBeenCalledTimes(3);

      if (_label === 'mixed network/server') {
        const { mapCanonicalTranslationError } = await import('@/shared/error-management/PublicTranslationErrorPolicy.js');
        expect(mapCanonicalTranslationError(terminalError)).toMatchObject({
          type: 'PROVIDER_TEMPORARILY_UNAVAILABLE',
          messageKey: 'ERRORS_CIRCUIT_BREAKER_OPEN',
        });
      }
    });

    it('returns non-circuit SERVER_ERROR unchanged after bounded retries', async () => {
      const serverError = Object.assign(new Error('HTTP 500'), {
        type: ErrorTypes.SERVER_ERROR,
        statusCode: 500,
      });
      const request = vi.fn().mockRejectedValue(serverError);
      const promise = queueManager.enqueue('server-only-provider', request);
      const rejection = expect(promise).rejects.toBe(serverError);

      await vi.advanceTimersByTimeAsync(10000);

      await rejection;
      expect(request).toHaveBeenCalledTimes(3);
    });

    it('preserves HTTP 402 semantic type on permanent failure', async () => {
      const paymentError = Object.assign(new Error('HTTP 402'), {
        type: ErrorTypes.INSUFFICIENT_BALANCE,
        statusCode: 402,
      });
      const request = vi.fn().mockRejectedValue(paymentError);
      const promise = queueManager.enqueue('payment-provider', request);

      await expect(promise).rejects.toBe(paymentError);
      expect(request).toHaveBeenCalledTimes(1);
    });

    it('does not retry insufficient balance when status is 429', async () => {
      const paymentError = Object.assign(new Error('No credits remaining'), {
        type: ErrorTypes.INSUFFICIENT_BALANCE,
        statusCode: 429,
      });
      const request = vi.fn().mockRejectedValue(paymentError);
      const promise = queueManager.enqueue('quota-provider', request);

      await expect(promise).rejects.toBe(paymentError);
      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });

  describe('Cancellation', () => {
    it('does not retry a cancellation-shaped rejection', async () => {
      const cancellation = Object.assign(new Error('Request cancelled'), {
        type: ErrorTypes.USER_CANCELLED,
        isCancelled: true,
      });
      const request = vi.fn().mockRejectedValue(cancellation);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };
      const promise = queueManager.enqueue('cancel-error-provider', request, 0, 'context', { executionContext });

      await expect(promise).rejects.toBe(cancellation);
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('cancel-error-provider').total).toBe(0);
      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'QUEUE_RETRY' }));
    });

    it('keeps a cancelled running item terminal after late resolution', async () => {
      const deferred = createDeferred();
      const promise = queueManager.enqueue('late-resolve-provider', () => deferred.promise, 0, 'context', { messageId: 'late-resolve' });
      await Promise.resolve();
      const item = queueManager.queues.get('late-resolve-provider')[0];

      queueManager.cancelByMessageId('late-resolve');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      deferred.resolve('late result');
      await Promise.resolve();

      expect(item.status).toBe('failed');
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('late-resolve-provider').total).toBe(0);
    });

    it('does not retry a cancelled running item after late rejection', async () => {
      const deferred = createDeferred();
      const promise = queueManager.enqueue('late-reject-provider', () => deferred.promise, 0, 'context', { messageId: 'late-reject' });
      await Promise.resolve();

      queueManager.cancelByMessageId('late-reject');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      const error = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
      deferred.reject(error);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10000);

      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(queueManager.getQueueStatus('late-reject-provider').total).toBe(0);
    });

    it('clears retry delay when the message is cancelled', async () => {
      const retryable = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
      const request = vi.fn().mockRejectedValue(retryable);
      const promise = queueManager.enqueue('retry-cancel-provider', request, 0, 'context', { messageId: 'retry-cancel' });
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(100);

      expect(queueManager.retryTimeouts.size).toBe(1);
      queueManager.cancelByMessageId('retry-cancel');
      await expect(promise).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });

    it('should cancel all items (including processing) for a provider', async () => {
      const mockRequest1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R1'), 1000)));
      const mockRequest2 = vi.fn().mockResolvedValue('R2');
      
      const p1 = queueManager.enqueue('cancel-provider', mockRequest1);
      const p2 = queueManager.enqueue('cancel-provider', mockRequest2);

      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelProvider('cancel-provider');
      expect(cancelledCount).toBe(2); 

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await expect(p2).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });

    it('should cancel items by UI context', async () => {
      const mockRequest1 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R1'), 1000)));
      const mockRequest2 = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R2'), 1000)));
      
      const p1 = queueManager.enqueue('p1', mockRequest1, 0, 'context', { uiContext: 'popup' });
      const p2 = queueManager.enqueue('p2', mockRequest2, 0, 'context', { uiContext: 'sidepanel' });

      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelByUiContext('popup');
      expect(cancelledCount).toBe(1);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      
      // p2 should still be processing/pending
      await vi.advanceTimersByTimeAsync(1000);
      expect(await p2).toBe('R2');
    });

    it('should cancel items by messageId', async () => {
      const mockRequest = vi.fn().mockImplementation(() => new Promise(resolve => setTimeout(() => resolve('R'), 1000)));
      const p1 = queueManager.enqueue('p', mockRequest, 0, 'context', { messageId: 'm1' });
      
      await vi.advanceTimersByTimeAsync(150);
      
      const cancelledCount = queueManager.cancelByMessageId('m1');
      expect(cancelledCount).toBe(1);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    });
  });

  describe('TEXT_TOO_LONG deterministic validation', () => {
    it('does not retry explicit TEXT_TOO_LONG errors', async () => {
      const textTooLongError = { type: ErrorTypes.TEXT_TOO_LONG, message: 'text is too long' };
      const mockRequest = vi.fn().mockRejectedValue(textTooLongError);

      const promise = queueManager.enqueue('text-long-provider', mockRequest);
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(10000);

      expect(mockRequest).toHaveBeenCalledTimes(1);
      await expect(promise).rejects.toBe(textTooLongError);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });

    it('does not append QUEUE_RETRY diagnostic for TEXT_TOO_LONG', async () => {
      const textTooLongError = { type: ErrorTypes.TEXT_TOO_LONG, message: 'text is too long' };
      const mockRequest = vi.fn().mockRejectedValue(textTooLongError);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };

      const promise = queueManager.enqueue('text-long-diag', mockRequest, 0, 'context', { executionContext });
      promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(10000);

      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'QUEUE_RETRY' })
      );
    });

    it('settles and removes TEXT_TOO_LONG item from queue', async () => {
      const textTooLongError = { type: ErrorTypes.TEXT_TOO_LONG, message: 'text is too long' };
      const mockRequest = vi.fn().mockRejectedValue(textTooLongError);

      await queueManager.enqueue('text-long-settle', mockRequest).catch(() => {});
      await vi.advanceTimersByTimeAsync(100);

      expect(queueManager.getQueueStatus('text-long-settle').total).toBe(0);
    });

    it('does not treat message-only "text is too long" as local validation', async () => {
      const messageError = { message: 'text is too long' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(messageError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('msg-long', mockRequest);

      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('does not treat HTTP 413 shaped error as local validation', async () => {
      const httpError = { statusCode: 413, message: 'payload too large' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(httpError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('http-long', mockRequest);

      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('still retries NETWORK_ERROR', async () => {
      const networkError = { type: ErrorTypes.NETWORK_ERROR, message: 'failed to fetch' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('net-retry', mockRequest);

      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('still retries API_RESPONSE_INVALID', async () => {
      const apiError = { type: ErrorTypes.API_RESPONSE_INVALID, message: 'invalid response' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(apiError)
        .mockResolvedValue('Success');

      const promise = queueManager.enqueue('api-retry', mockRequest);

      await vi.advanceTimersByTimeAsync(150);
      expect(mockRequest).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(3000);
      expect(mockRequest).toHaveBeenCalledTimes(2);

      const result = await promise;
      expect(result).toBe('Success');
    });

    it('processes subsequent tasks after TEXT_TOO_LONG rejection', async () => {
      const textTooLongError = { type: ErrorTypes.TEXT_TOO_LONG, message: 'text is too long' };
      let callCount = 0;
      const mockRequest = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.reject(textTooLongError);
        return Promise.resolve('task2-ok');
      });

      const p1 = queueManager.enqueue('progress-provider', mockRequest).catch(error => error);
      const p2 = queueManager.enqueue('progress-provider', mockRequest);

      await vi.advanceTimersByTimeAsync(200);

      await expect(p1).resolves.toBe(textTooLongError);
      await expect(p2).resolves.toBe('task2-ok');
      expect(queueManager.getQueueStatus('progress-provider').total).toBe(0);
    });
  });

  describe('provider HTTP TEXT_EMPTY', () => {
    it.each([400, 422])('does not retry HTTP %s TEXT_EMPTY errors', async (statusCode) => {
      const error = { type: ErrorTypes.TEXT_EMPTY, statusCode, message: 'Text is empty' };
      const request = vi.fn().mockRejectedValue(error);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };

      const promise = queueManager.enqueue('provider-empty', request, 0, 'context', { executionContext });
      const rejection = expect(promise).rejects.toBe(error);

      await vi.advanceTimersByTimeAsync(150);
      await rejection;
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'QUEUE_RETRY' })
      );
    });
  });

  describe('deterministic client HTTP_ERROR', () => {
    it.each([400, 404, 422])('does not retry HTTP %s errors', async (statusCode) => {
      const error = { type: ErrorTypes.HTTP_ERROR, statusCode, message: `HTTP ${statusCode}` };
      const request = vi.fn().mockRejectedValue(error);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };

      const promise = queueManager.enqueue(`deterministic-http-${statusCode}`, request, 0, 'context', { executionContext });
      const rejection = expect(promise).rejects.toBe(error);

      await vi.advanceTimersByTimeAsync(150);
      await rejection;
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'QUEUE_RETRY' })
      );
    });
  });

  describe('provider request-size HTTP_ERROR', () => {
    it.each([
      [400, 'request is too long'],
      [422, 'maximum context length exceeded'],
      [413, 'Payload Too Large'],
    ])('does not retry HTTP %s remote-size errors', async (statusCode, message) => {
      const error = { type: ErrorTypes.HTTP_ERROR, statusCode, message };
      const request = vi.fn().mockRejectedValue(error);
      const executionContext = { operation: { appendDiagnostic: vi.fn() } };

      const promise = queueManager.enqueue('provider-size', request, 0, 'context', { executionContext });
      const rejection = expect(promise).rejects.toBe(error);

      await vi.advanceTimersByTimeAsync(150);
      await rejection;
      await vi.advanceTimersByTimeAsync(10000);

      expect(request).toHaveBeenCalledTimes(1);
      expect(queueManager.retryTimeouts.size).toBe(0);
      expect(executionContext.operation.appendDiagnostic).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'QUEUE_RETRY' })
      );
    });

    it('retains retries for HTTP_ERROR 409', async () => {
      const error = { type: ErrorTypes.HTTP_ERROR, statusCode: 409, message: 'Conflict' };
      const request = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('healthy');

      const promise = queueManager.enqueue('ordinary-http', request);
      await vi.advanceTimersByTimeAsync(150);
      expect(request).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(3000);

      await expect(promise).resolves.toBe('healthy');
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  describe('Parallel queue lane', () => {
    it('should dispatch all pending parallel-queue requests without serializing them', async () => {
      const first = createDeferred();
      const second = createDeferred();
      const mockRequest1 = vi.fn().mockImplementation(() => first.promise);
      const mockRequest2 = vi.fn().mockImplementation(() => second.promise);

      const p1 = queueManager.enqueue('test-provider::parallel', mockRequest1, 0, 'select_element', {
        messageId: 'parallel-msg'
      });
      const p2 = queueManager.enqueue('test-provider::parallel', mockRequest2, 0, 'select_element', {
        messageId: 'parallel-msg'
      });

      await Promise.resolve();

      expect(mockRequest1).toHaveBeenCalledTimes(1);
      expect(mockRequest2).toHaveBeenCalledTimes(1);

      first.resolve('R1');
      second.resolve('R2');

      await expect(p1).resolves.toBe('R1');
      await expect(p2).resolves.toBe('R2');
    });

    it('should cancel in-flight parallel-queue requests by messageId', async () => {
      const first = createDeferred();
      const second = createDeferred();
      const mockRequest1 = vi.fn().mockImplementation(() => first.promise);
      const mockRequest2 = vi.fn().mockImplementation(() => second.promise);

      const p1 = queueManager.enqueue('test-provider::parallel', mockRequest1, 0, 'select_element', {
        messageId: 'parallel-cancel'
      });
      const p2 = queueManager.enqueue('test-provider::parallel', mockRequest2, 0, 'select_element', {
        messageId: 'parallel-cancel'
      });

      await Promise.resolve();

      const cancelledCount = queueManager.cancelByMessageId('parallel-cancel');
      expect(cancelledCount).toBe(2);
      expect(queueManager.getQueueStatus('test-provider::parallel').total).toBe(0);

      await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      await expect(p2).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });

      first.resolve('R1');
      second.resolve('R2');
      await Promise.resolve();
    });

    it('should remove cancelled pending parallel-queue items', async () => {
      const processSpy = vi.spyOn(queueManager, '_processQueue').mockImplementation(() => {});
      const mockRequest = vi.fn().mockResolvedValue('R1');

      try {
        const p1 = queueManager.enqueue('pending-provider::parallel', mockRequest, 0, 'select_element', {
          messageId: 'pending-cancel'
        });

        expect(queueManager.getQueueStatus('pending-provider::parallel').total).toBe(1);

        const cancelledCount = queueManager.cancelByMessageId('pending-cancel');
        expect(cancelledCount).toBe(1);
        expect(queueManager.getQueueStatus('pending-provider::parallel').total).toBe(0);

        await expect(p1).rejects.toMatchObject({ type: ErrorTypes.USER_CANCELLED });
      } finally {
        processSpy.mockRestore();
      }
    });

    it('should keep retrying parallel-queue items until retry completes', async () => {
      const mockError = { type: ErrorTypes.RATE_LIMIT_REACHED, message: 'Rate limit' };
      const mockRequest = vi.fn()
        .mockRejectedValueOnce(mockError)
        .mockResolvedValueOnce('R1');

      const promise = queueManager.enqueue('retry-parallel::parallel', mockRequest, 0, 'select_element', {
        messageId: 'retry-parallel'
      });

      await vi.advanceTimersByTimeAsync(50);
      expect(queueManager.getQueueStatus('retry-parallel::parallel').status.retrying).toBe(1);
      expect(queueManager.getQueueStatus('retry-parallel::parallel').total).toBe(1);

      await vi.advanceTimersByTimeAsync(2500);
      await expect(promise).resolves.toBe('R1');
      expect(queueManager.getQueueStatus('retry-parallel::parallel').total).toBe(0);
    });

    it('queue retry bound: NETWORK_ERROR is bounded to maxRetries attempts', async () => {
      const mockError = { type: ErrorTypes.NETWORK_ERROR, message: 'network failure' };
      let callCount = 0;
      const mockRequest = vi.fn(() => {
        callCount++;
        return Promise.reject(mockError);
      });

      const promise = queueManager.enqueue('bound-test-provider', mockRequest, 0, 'select_element', {
        messageId: 'bound-test'
      });
      const rejection = expect(promise).rejects.toMatchObject({
        type: ErrorTypes.NETWORK_ERROR,
        message: 'network failure',
      });

      await vi.advanceTimersByTimeAsync(30000);
      await rejection;

      // NETWORK_ERROR maxRetries=4, so exactly 4 attempts before permanent failure
      expect(callCount).toBe(4);
      expect(queueManager.getQueueStatus('bound-test-provider').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });
});
