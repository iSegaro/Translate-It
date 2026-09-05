import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    debugLazy: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/shared/error-management/ErrorHandler.js', () => ({
  ErrorHandler: {
    getInstance: () => ({
      handle: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { ProviderRequestEngine } from '@/features/translation/providers/utils/ProviderRequestEngine.js';

function provider() {
  return {
    providerName: 'TestProvider',
    providerSettingKey: null,
    _initializeProxy: vi.fn().mockResolvedValue({
      enabled: true,
      type: 'socks',
      host: '127.0.0.1',
      port: 1080,
      auth: { username: '', password: '' },
    }),
  };
}

function baseParams(abortController) {
  return {
    url: 'http://target.test/translate',
    fetchOptions: { headers: {} },
    extractResponse: vi.fn(),
    context: 'test',
    abortController,
  };
}

function fetchThatRejectsOnAbort() {
  return vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
}

describe('SOCKS proxy cancellation through ProviderRequestEngine', () => {
  beforeEach(() => {
    proxyManager.setConfig({
      enabled: true,
      type: 'socks',
      host: '127.0.0.1',
      port: 1080,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    proxyManager.setConfig({ enabled: false, type: 'http', host: '', port: 8080 });
  });

  it('preserves USER_CANCELLED through real SOCKS preflight and ProviderRequestEngine', async () => {
    const controller = new AbortController();
    const fetchMock = fetchThatRejectsOnAbort();
    vi.stubGlobal('fetch', fetchMock);
    expect(proxyManager.isEnabled()).toBeTruthy();
    await proxyManager._initializeStrategies();
    const providerInstance = provider();
    const execution = ProviderRequestEngine.executeApiCall(
      providerInstance,
      baseParams(controller),
    );

    expect(providerInstance._initializeProxy).toHaveBeenCalled();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort('user-cancelled');

    const error = await execution.catch((caughtError) => caughtError);
    expect(error).toMatchObject({ type: ErrorTypes.USER_CANCELLED });
    expect(error.type).not.toBe(ErrorTypes.NETWORK_ERROR);
    expect(error.transportFailure).toBeUndefined();
  });

  it('preserves internal abort provenance through real SOCKS preflight and ProviderRequestEngine', async () => {
    const controller = new AbortController();
    const fetchMock = fetchThatRejectsOnAbort();
    vi.stubGlobal('fetch', fetchMock);
    expect(proxyManager.isEnabled()).toBeTruthy();
    await proxyManager._initializeStrategies();
    const providerInstance = provider();
    const execution = ProviderRequestEngine.executeApiCall(
      providerInstance,
      baseParams(controller),
    );

    expect(providerInstance._initializeProxy).toHaveBeenCalled();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    controller.abort('document-replaced');

    const error = await execution.catch((caughtError) => caughtError);
    expect(error).toMatchObject({
      operationAborted: true,
      cancellationReason: 'document-replaced',
    });
    expect(error.type).not.toBe(ErrorTypes.USER_CANCELLED);
    expect(error.type).not.toBe(ErrorTypes.NETWORK_ERROR);
    expect(error.transportFailure).toBeUndefined();
  });
});
