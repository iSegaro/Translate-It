import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock only what the QueueManager tests rely on, plus storage so the real
// ApiKeyManager.getKeys can resolve our fixture key set. TranslationStatsManager
// and browser/compatibility.js are used for real.
vi.mock('@/shared/storage/core/StorageCore.js', () => ({
  storageManager: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    init: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debugLazy: vi.fn()
  })
}));

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { getBrowserInfo: vi.fn(), getManifest: () => ({ version: '1.0.0' }) },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

import { queueManager } from './QueueManager.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import { ProviderRequestEngine } from '@/features/translation/providers/utils/ProviderRequestEngine.js';

const KEYS = ['key1', 'key2', 'key3'];
const PROVIDER_SETTING_KEY = 'TEST_API_KEY';

const make429Response = () => ({
  ok: false,
  status: 429,
  statusText: 'Too Many Requests',
  json: async () => ({ error: { message: 'Rate limit exceeded' } }),
  headers: new Map([['content-type', 'application/json']]),
  clone() { return this; }
});

const make401Response = () => ({
  ok: false,
  status: 401,
  statusText: 'Unauthorized',
  json: async () => ({ error: { message: 'Invalid API Key' } }),
  headers: new Map([['content-type', 'application/json']]),
  clone() { return this; }
});

const makeNetworkError = () => Object.assign(new TypeError('Failed to fetch'), {
  type: ErrorTypes.NETWORK_ERROR
});

const makeCancelledError = () => Object.assign(new Error('cancelled'), {
  type: ErrorTypes.USER_CANCELLED
});

const provider = {
  providerName: 'TestProvider',
  providerSettingKey: PROVIDER_SETTING_KEY,
  _initializeProxy: vi.fn().mockResolvedValue(true)
};

const extractResponse = vi.fn((data) => data);

describe('Cross-Layer Retry Bound Integration', () => {
  let fetchSpy;
  let currentKey;
  const usedKeys = [];
  let executionCount;

  const resetKeysRecorder = () => {
    usedKeys.length = 0;
    currentKey = KEYS[0];
    executionCount = 0;
  };

  const installFetch = (behavior) => {
    fetchSpy = vi.spyOn(proxyManager, 'fetch').mockImplementation((...args) => {
      usedKeys.push(currentKey);
      return behavior(...args);
    });
  };

  const updateApiKey = (key) => {
    currentKey = key;
  };

  const makeRequestFn = () => async () => {
    executionCount += 1;
    currentKey = KEYS[0];
    await ProviderRequestEngine.executeRequest(provider, {
      url: 'https://api.test.com/translate',
      fetchOptions: { method: 'POST', headers: {} },
      extractResponse,
      context: 'select_element',
      updateApiKey,
      callPurpose: 'PRIMARY_TRANSLATION'
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    queueManager.cleanup();
    resetKeysRecorder();
    storageManager.get.mockResolvedValue({ [PROVIDER_SETTING_KEY]: KEYS.join('\n') });
    storageManager.set.mockResolvedValue();
  });

  afterEach(() => {
    queueManager.cleanup();
    fetchSpy = null;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('failover-eligible: RATE_LIMIT_REACHED', () => {
    it('proves total transport calls = queueAttempts x keysPerAttempt with exact key order', async () => {
      installFetch(() => make429Response());

      const promise = queueManager.enqueue('bound', makeRequestFn(), 0, 'select_element', {
        messageId: 'rate-limit-bound'
      });
      const rejection = promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(30000);
      await rejection;

      const totalCalls = fetchSpy.mock.calls.length;
      const keysPerAttempt = KEYS.length;

      expect(executionCount).toBe(5);
      expect(totalCalls).toBe(executionCount * keysPerAttempt);
      expect(usedKeys).toEqual([
        'key1', 'key2', 'key3',
        'key1', 'key2', 'key3',
        'key1', 'key2', 'key3',
        'key1', 'key2', 'key3',
        'key1', 'key2', 'key3'
      ]);
    });

    it('final rejection retains RATE_LIMIT_REACHED type and drains the queue', async () => {
      installFetch(() => make429Response());

      const promise = queueManager.enqueue('bound-type', makeRequestFn(), 0, 'select_element', {
        messageId: 'rate-limit-type'
      });
      const rejectionAssertion = expect(promise).rejects.toMatchObject({ type: ErrorTypes.RATE_LIMIT_REACHED });

      await vi.advanceTimersByTimeAsync(30000);

      await rejectionAssertion;
      expect(queueManager.getQueueStatus('bound-type').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });

  describe('control: NETWORK_ERROR (no key failover)', () => {
    it('one transport call per queue attempt; no key rotation; bounded retries', async () => {
      installFetch(() => { throw makeNetworkError(); });

      const promise = queueManager.enqueue('network', makeRequestFn(), 0, 'select_element', {
        messageId: 'network-control'
      });
      const rejection = promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(30000);
      await rejection;

      expect(executionCount).toBe(4);
      expect(fetchSpy.mock.calls.length).toBe(4);
      expect(usedKeys).toEqual(['key1', 'key1', 'key1', 'key1']);
      expect(queueManager.getQueueStatus('network').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });

  describe('control: API_KEY_INVALID (fatal auth exhaustion)', () => {
    it('exhausts all keys once; no QueueManager retry', async () => {
      installFetch(() => make401Response());

      const queuePromise = queueManager.enqueue('fatal-auth', makeRequestFn(), 0, 'select_element', {
        messageId: 'fatal-auth'
      });

      const rejectionAssertion = expect(queuePromise).rejects.toMatchObject({
        type: ErrorTypes.API_KEY_INVALID,
      });

      await vi.advanceTimersByTimeAsync(30000);
      await rejectionAssertion;

      expect(executionCount).toBe(1);
      expect(fetchSpy.mock.calls.length).toBe(3);
      expect(usedKeys).toEqual(['key1', 'key2', 'key3']);
      expect(queueManager.getQueueStatus('fatal-auth').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });

  describe('control: USER_CANCELLED', () => {
    it('one QueueManager attempt, one transport call, no failover, no retry', async () => {
      installFetch(() => { throw makeCancelledError(); });

      const promise = queueManager.enqueue('cancelled', makeRequestFn(), 0, 'select_element', {
        messageId: 'cancel-control'
      });
      const rejection = promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(100);
      await rejection;

      expect(executionCount).toBe(1);
      expect(fetchSpy.mock.calls.length).toBe(1);
      expect(usedKeys).toEqual(['key1']);
      expect(queueManager.getQueueStatus('cancelled').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });

  describe('control: TEXT_TOO_LONG', () => {
    it('zero transport calls, no failover, QueueManager does not retry', async () => {
      installFetch(() => make429Response());

      const promise = queueManager.enqueue('too-long', async () => {
        const err = new Error('Text too long');
        err.type = ErrorTypes.TEXT_TOO_LONG;
        throw err;
      }, 0, 'select_element', {
        messageId: 'too-long-control'
      });
      const rejection = promise.catch(() => {});

      await vi.advanceTimersByTimeAsync(100);
      await rejection;

      expect(fetchSpy.mock.calls.length).toBe(0);
      expect(usedKeys).toEqual([]);
      expect(queueManager.getQueueStatus('too-long').total).toBe(0);
      expect(queueManager.retryTimeouts.size).toBe(0);
    });
  });
});