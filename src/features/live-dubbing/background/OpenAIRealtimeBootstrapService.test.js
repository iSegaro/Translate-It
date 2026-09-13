import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import {
  OPENAI_REALTIME_TRANSLATE_MODEL,
  OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT,
  OpenAIRealtimeBootstrapService,
} from './OpenAIRealtimeBootstrapService.js';

function okMint(value = 'ek_test_secret') {
  return { ok: true, status: 200, json: async () => ({ value, expires_at: 1750000000 }) };
}

function failMint(status, body = {}) {
  return { ok: false, status, json: async () => body };
}

function openAIError({ type = 'invalid_request_error', code = null, message = 'Request failed' } = {}) {
  return { error: { type, code, message } };
}

function createService({ keys = ['key-1'], fetchImpl, logger } = {}) {
  const calls = [];
  const impl = fetchImpl || (async (url, options) => {
    calls.push({ url, options });
    return okMint();
  });
  const service = new OpenAIRealtimeBootstrapService({
    getKeysImpl: async () => keys,
    fetchImpl: impl,
    logger: logger || { debug: () => {}, warn: () => {}, error: () => {} },
  });
  return { service, calls };
}

describe('OpenAIRealtimeBootstrapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints with the documented endpoint, auth, and body shape', async () => {
    const { service, calls } = createService({ keys: ['key-1'] });

    await expect(service.mintClientSecret('en-US')).resolves.toBe('ek_test_secret');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT);
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer key-1',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      session: {
        model: OPENAI_REALTIME_TRANSLATE_MODEL,
        audio: { output: { language: 'en-US' } },
      },
    });
  });

  it('returns only the documented secret value, never response metadata', async () => {
    const { service } = createService({ keys: ['live-key-secret'] });

    const secret = await service.mintClientSecret('fr');

    expect(secret).toBe('ek_test_secret');
    expect(typeof secret).toBe('string');
    expect(JSON.stringify(secret)).not.toContain('live-key-secret');
    expect(JSON.stringify(secret)).not.toContain('expires');
  });

  it('tries the next key for invalid credentials', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMint(401))
      .mockResolvedValueOnce(okMint('ek_second_secret'));
    const { service } = createService({ keys: ['bad-key', 'good-key'], fetchImpl });

    await expect(service.mintClientSecret('es')).resolves.toBe('ek_second_secret');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer bad-key');
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer good-key');
  });

  it('tries the next key for quota and rate-limit failures', async () => {
    const quotaFetch = vi.fn()
      .mockResolvedValueOnce(failMint(400, openAIError({ type: 'insufficient_quota', code: 'insufficient_quota' })))
      .mockResolvedValueOnce(okMint('ek_quota_fallback'));
    const { service: quotaService } = createService({ keys: ['quota-key', 'good-key'], fetchImpl: quotaFetch });
    await expect(quotaService.mintClientSecret('de')).resolves.toBe('ek_quota_fallback');

    const rateFetch = vi.fn()
      .mockResolvedValueOnce(failMint(429, openAIError({ code: 'rate_limit_exceeded' })))
      .mockResolvedValueOnce(okMint('ek_rate_fallback'));
    const { service: rateService } = createService({ keys: ['limited-key', 'good-key'], fetchImpl: rateFetch });
    await expect(rateService.mintClientSecret('de')).resolves.toBe('ek_rate_fallback');
  });

  it('stops without failover for request, forbidden, serving, or transport failures', async () => {
    for (const failure of [
      failMint(400, openAIError()),
      failMint(403, openAIError({ type: 'permissions_error', code: 'organization_not_verified' })),
      failMint(500),
    ]) {
      const fetchImpl = vi.fn().mockResolvedValue(failure);
      const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });
      await expect(service.mintClientSecret('en')).resolves.toBeNull();
      expect(fetchImpl).toHaveBeenCalledOnce();
    }

    const transport = vi.fn().mockRejectedValue(new Error('network down'));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl: transport });
    await expect(service.mintClientSecret('en')).resolves.toBeNull();
    expect(transport).toHaveBeenCalledOnce();
  });

  it('returns null without network use for missing keys, malformed language, or payload', async () => {
    const noKeysFetch = vi.fn(async () => okMint());
    const { service: noKeysService } = createService({ keys: [], fetchImpl: noKeysFetch });
    await expect(noKeysService.mintClientSecret('en')).resolves.toBeNull();
    expect(noKeysFetch).not.toHaveBeenCalled();

    const invalidLanguageFetch = vi.fn(async () => okMint());
    const { service: invalidLanguageService } = createService({ keys: ['key-1'], fetchImpl: invalidLanguageFetch });
    await expect(invalidLanguageService.mintClientSecret('not a language!!')).resolves.toBeNull();
    expect(invalidLanguageFetch).not.toHaveBeenCalled();

    const malformedFetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const { service: malformedService } = createService({ keys: ['key-1'], fetchImpl: malformedFetch });
    await expect(malformedService.mintClientSecret('en')).resolves.toBeNull();
    expect(malformedFetch).toHaveBeenCalledOnce();
  });

  it('uses the proxy path and never falls back to direct fetch', async () => {
    const config = { enabled: false };
    resolveProxyConfig.mockResolvedValue(config);
    proxyManager.fetch.mockResolvedValue(okMint('ek_proxy_secret'));
    const directFetch = vi.spyOn(globalThis, 'fetch');
    const service = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintClientSecret('en')).resolves.toBe('ek_proxy_secret');
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(proxyManager.fetch.mock.calls[0][2]).toBe(config);
    expect(proxyManager.fetch.mock.calls[0]).toHaveLength(3);
    expect(directFetch).not.toHaveBeenCalled();
  });
});
