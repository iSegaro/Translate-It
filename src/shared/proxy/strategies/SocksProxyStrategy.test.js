import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { SocksProxyStrategy } from './SocksProxyStrategy.js';

function response() {
  return {
    status: 200,
    headers: { get: () => null },
  };
}

function fetchThatFollowsSignal() {
  return vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }

    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
}

describe('SocksProxyStrategy timeout provenance', () => {
  let strategy;

  beforeEach(() => {
    vi.useFakeTimers();
    strategy = new SocksProxyStrategy({
      type: 'socks',
      host: '127.0.0.1',
      port: 1080,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('classifies only its own preflight timeout as proxy NETWORK_ERROR', async () => {
    const fetchMock = fetchThatFollowsSignal();
    vi.stubGlobal('fetch', fetchMock);

    const execution = strategy.execute('http://target.test/translate');
    await vi.advanceTimersByTimeAsync(5000);

    await expect(execution).rejects.toMatchObject({
      type: ErrorTypes.NETWORK_ERROR,
      transportFailure: 'socks-proxy-timeout',
      cause: expect.objectContaining({ name: 'TimeoutError' }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves an already-aborted caller signal without proxy classification', async () => {
    const callerController = new AbortController();
    callerController.abort('user-cancelled');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(strategy.execute('http://target.test/translate', {
      signal: callerController.signal,
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves caller abort when it wins before the SOCKS timeout', async () => {
    const callerController = new AbortController();
    const fetchMock = fetchThatFollowsSignal();
    vi.stubGlobal('fetch', fetchMock);
    const removeSpy = vi.spyOn(callerController.signal, 'removeEventListener');
    const execution = strategy.execute('http://target.test/translate', {
      signal: callerController.signal,
    });

    callerController.abort('user-cancelled');

    await expect(execution).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['document-replaced', 'timeout'])(
    'preserves internal caller abort reason %s without proxy classification', async (reason) => {
      const callerController = new AbortController();
      const fetchMock = fetchThatFollowsSignal();
      vi.stubGlobal('fetch', fetchMock);
      const execution = strategy.execute('http://target.test/translate', {
        signal: callerController.signal,
      });

      callerController.abort(reason);

      await expect(execution).rejects.toMatchObject({
        name: 'AbortError',
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('keeps SOCKS timeout ownership after a later caller abort', async () => {
    const callerController = new AbortController();
    const fetchMock = fetchThatFollowsSignal();
    vi.stubGlobal('fetch', fetchMock);
    const execution = strategy.execute('http://target.test/translate', {
      signal: callerController.signal,
    });

    await vi.advanceTimersByTimeAsync(5000);
    callerController.abort('user-cancelled');

    await expect(execution).rejects.toMatchObject({
      type: ErrorTypes.NETWORK_ERROR,
      transportFailure: 'socks-proxy-timeout',
    });
  });

  it('cleans caller listener and timeout after successful preflight', async () => {
    const callerController = new AbortController();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response());
    vi.stubGlobal('fetch', fetchMock);
    const removeSpy = vi.spyOn(callerController.signal, 'removeEventListener');

    await expect(strategy.execute('http://target.test/translate', {
      signal: callerController.signal,
    })).resolves.toBeDefined();

    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock.mock.calls[1][1].signal).toBe(callerController.signal);
  });

  it('passes already typed errors through the outer execute wrapper', async () => {
    const typedError = Object.assign(new Error('SOCKS proxy connection timed out'), {
      type: ErrorTypes.NETWORK_ERROR,
      transportFailure: 'socks-proxy-timeout',
      cause: new Error('native timeout'),
    });
    vi.spyOn(strategy, '_socksProxy').mockRejectedValue(typedError);

    await expect(strategy.execute('http://target.test/translate')).rejects.toBe(typedError);
  });
});
