import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));

import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import {
  OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT,
  OpenAIRealtimeBootstrapService,
} from './OpenAIRealtimeBootstrapService.js';

function failMint(status, body = {}) {
  return { ok: false, status, json: async () => body };
}

function openAIError({ code = null, message = 'Request failed' } = {}) {
  return { error: { type: 'invalid_request_error', code, message } };
}

const proxyConfig = {
  enabled: true,
  type: 'https',
  host: 'proxy.test',
  port: 443,
  auth: { username: '', password: '' },
};

function createService() {
  return new OpenAIRealtimeBootstrapService({
    getKeysImpl: async () => ['first-key', 'second-key'],
    logger: { debug: () => {}, warn: () => {}, error: () => {} },
  });
}

describe('OpenAIRealtimeBootstrapService HTTPS proxy integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resolveProxyConfig.mockResolvedValue(proxyConfig);
    proxyManager.errorHandler = { handle: vi.fn().mockResolvedValue(undefined) };
    proxyManager.logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    proxyManager.strategies.clear();
    await proxyManager._initializeStrategies();
  });

  afterEach(() => {
    proxyManager.setConfig(null);
    vi.unstubAllGlobals();
  });

  it.each([
    [401, {}],
    [429, openAIError({ code: 'rate_limit_exceeded' })],
  ])('fails closed without key failover for unmarked HTTP %s through the production proxy path', async (status, body) => {
    const proxyFetch = vi.fn()
      .mockResolvedValueOnce(failMint(status, body));
    vi.stubGlobal('fetch', proxyFetch);
    const service = createService();

    await expect(service.mintClientSecret('en-US')).resolves.toBeNull();
    expect(proxyFetch).toHaveBeenCalledOnce();
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
    expect(proxyFetch.mock.calls[0][0]).toBe('https://proxy.test:443');
    expect(proxyFetch.mock.calls[0][1].headers['X-Target-URL'])
      .toBe(OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT);
    expect(proxyFetch.mock.calls[0][1].headers.Authorization).toBe('Bearer first-key');
  });

  it.each([401, 429, 407, 502, 503, 504])('stops without key failover for proxy-origin or unmarked HTTP %s', async (status) => {
    const proxyFetch = vi.fn().mockResolvedValue(failMint(status, openAIError({
      code: 'invalid_api_key',
      message: 'proxy-generated failure body must not be classified',
    })));
    vi.stubGlobal('fetch', proxyFetch);
    const service = createService();

    await expect(service.mintClientSecret('en-US')).resolves.toBeNull();
    expect(proxyFetch).toHaveBeenCalledOnce();
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
  });

  it.each([401, 429, 407, 502, 503, 504])('rejects proxy HTTP %s without recording a successful ProxyManager request', async (status) => {
    const proxyFetch = vi.fn().mockResolvedValue(failMint(status, openAIError({
      code: 'invalid_api_key',
      message: 'proxy-generated failure body must not be classified',
    })));
    vi.stubGlobal('fetch', proxyFetch);

    await expect(proxyManager.fetch(
      OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT,
      {},
      proxyConfig,
      { allowTargetErrorStatuses: [401, 429] },
    )).rejects.toThrow(`HTTPS proxy returned error status: ${status}`);
    expect(proxyManager.logger.info).not.toHaveBeenCalledWith(
      expect.stringContaining('[Proxy] Request successful'),
    );
  });

  it('stops without key failover when the proxy transport fails', async () => {
    const proxyFetch = vi.fn().mockRejectedValue(new TypeError('proxy unavailable'));
    vi.stubGlobal('fetch', proxyFetch);
    const service = createService();

    await expect(service.mintClientSecret('en-US')).resolves.toBeNull();
    expect(proxyFetch).toHaveBeenCalledOnce();
  });
});
