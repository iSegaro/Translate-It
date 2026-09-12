import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import {
  GEMINI_LIVE_AUTH_TOKEN_ENDPOINT,
  GEMINI_LIVE_MODEL,
} from '../providers/GeminiLiveProviderAdapter.js';
import { GeminiLiveBootstrapService } from './GeminiLiveBootstrapService.js';

function okMint(name) {
  return { ok: true, status: 200, json: async () => ({ name }) };
}

function failMint(status = 401) {
  return { ok: false, status, json: async () => ({}) };
}

function failMintWith(status, body) {
  return { ok: false, status, json: async () => body };
}

function googleErrorBody({ message = 'Request failed', status = 'INVALID_ARGUMENT', reasons = [] } = {}) {
  return {
    error: {
      code: 400,
      message,
      status,
      details: reasons.map(reason => ({ reason })),
    },
  };
}

function createService({ keys = ['key-1'], legacyKey = '', fetchImpl, logger } = {}) {
  const calls = [];
  const impl = fetchImpl || (async (url, options) => {
    calls.push({ url, options });
    return okMint('auth_tokens/token-1');
  });
  const service = new GeminiLiveBootstrapService({
    getKeysImpl: async () => keys,
    getLegacyKeyImpl: async () => legacyKey,
    fetchImpl: impl,
    logger: logger || { debug: () => {}, warn: () => {}, error: () => {} },
  });
  return { service, calls };
}

describe('GeminiLiveBootstrapService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints a single-use token with the constrained request shape', async () => {
    const { service, calls } = createService({ keys: ['key-1'] });

    await expect(service.mintEphemeralToken('zh-CN')).resolves.toBe('auth_tokens/token-1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(GEMINI_LIVE_AUTH_TOKEN_ENDPOINT);
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'x-goog-api-key': 'key-1',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      uses: 1,
      liveConnectConstraints: {
        model: GEMINI_LIVE_MODEL,
        config: {
          responseModalities: ['AUDIO'],
          translationConfig: {
            targetLanguageCode: 'zh-Hans',
            echoTargetLanguage: false,
          },
        },
      },
    });
  });

  it('succeeds on the first key without trying the rest', async () => {
    const fetchImpl = vi.fn(async () => okMint('auth_tokens/token-1'));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-1');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('key-1');
  });

  it('tries the next key when the first mint fails with an invalid key', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMint(401))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['bad-key', 'good-key'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('bad-key');
    expect(fetchImpl.mock.calls[1][1].headers['x-goog-api-key']).toBe('good-key');
  });

  it('advances on rate-limit (429) failures', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMint(429))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['limited-key', 'good-key'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('advances on quota exhaustion metadata', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMintWith(429, googleErrorBody({
        message: 'Quota exceeded for quota metric.',
        status: 'RESOURCE_EXHAUSTED',
        reasons: ['QUOTA_EXCEEDED'],
      })))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['exhausted-key', 'good-key'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('advances on key-invalid Google metadata with a 400 status', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMintWith(400, googleErrorBody({
        message: 'API key not valid. Please pass a valid API key.',
        status: 'INVALID_ARGUMENT',
        reasons: ['API_KEY_INVALID'],
      })))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['bad-key', 'good-key'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('stops without a next key on plain request-shape (400) failures', async () => {
    const fetchImpl = vi.fn(async () => failMintWith(400, googleErrorBody({
      message: 'Invalid liveConnectConstraints.',
      status: 'INVALID_ARGUMENT',
    })));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('stops without a next key on forbidden (403) failures', async () => {
    const fetchImpl = vi.fn(async () => failMint(403));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('tries the next key when metadata explicitly identifies PERMISSION_DENIED', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMintWith(403, googleErrorBody({
        message: 'Permission denied on the key.',
        status: 'PERMISSION_DENIED',
        reasons: ['PERMISSION_DENIED'],
      })))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['denied-key', 'good-key'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/token-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('denied-key');
    expect(fetchImpl.mock.calls[1][1].headers['x-goog-api-key']).toBe('good-key');
  });

  it('stops without a next key on a bare 403 with no readable metadata', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('stops without a next key on Gemini 5xx failures', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMint(500))
      .mockResolvedValueOnce(okMint('auth_tokens/token-2'));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('stops without a next key when the transport throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('stops without a next key on malformed success payloads', async () => {
    const missingName = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const { service: missingNameService } = createService({ keys: ['key-1', 'key-2'], fetchImpl: missingName });
    await expect(missingNameService.mintEphemeralToken('en')).resolves.toBeNull();
    expect(missingName).toHaveBeenCalledOnce();

    const unreadable = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }));
    const { service: unreadableService } = createService({ keys: ['key-1', 'key-2'], fetchImpl: unreadable });
    await expect(unreadableService.mintEphemeralToken('en')).resolves.toBeNull();
    expect(unreadable).toHaveBeenCalledOnce();
  });

  it('falls back to the legacy key only when no stored keys exist', async () => {
    const fetchImpl = vi.fn(async () => okMint('auth_tokens/legacy-token'));
    const { service } = createService({ keys: [], legacyKey: 'legacy-key', fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/legacy-token');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('legacy-key');
  });

  it('returns null without network use when no keys are configured', async () => {
    const fetchImpl = vi.fn(async () => okMint('auth_tokens/token-1'));
    const { service } = createService({ keys: [], legacyKey: '', fetchImpl });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null without network use for an unsupported language', async () => {
    const fetchImpl = vi.fn(async () => okMint('auth_tokens/token-1'));
    const { service } = createService({ keys: ['key-1'], fetchImpl });

    await expect(service.mintEphemeralToken('xx')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never exposes keys or tokens through results, rejections, or logs', async () => {
    const debug = vi.fn();
    const fetchImpl = vi.fn(async (url, options) => {
      throw new Error(`boom with ${options.headers['x-goog-api-key']} inside`);
    });
    const { service } = createService({
      keys: ['live-key-secret'],
      fetchImpl,
      logger: { debug, warn: () => {}, error: () => {} },
    });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(JSON.stringify(debug.mock.calls)).not.toContain('live-key-secret');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('auth_tokens');
  });

  it('returns only the token value, never a configured key', async () => {
    const { service } = createService({ keys: ['live-key-secret'] });

    const token = await service.mintEphemeralToken('en');
    expect(token).toBe('auth_tokens/token-1');
    expect(token).not.toContain('live-key-secret');
  });

  it('mints through the proxy infrastructure on the production path', async () => {
    const config = { enabled: false };
    resolveProxyConfig.mockResolvedValue(config);
    proxyManager.fetch.mockResolvedValue(okMint('auth_tokens/proxy-token'));
    const service = new GeminiLiveBootstrapService({
      getKeysImpl: async () => ['key-1'],
      getLegacyKeyImpl: async () => '',
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintEphemeralToken('en')).resolves.toBe('auth_tokens/proxy-token');
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(proxyManager.fetch.mock.calls[0][0]).toBe(GEMINI_LIVE_AUTH_TOKEN_ENDPOINT);
    expect(proxyManager.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('key-1');
    expect(proxyManager.fetch.mock.calls[0][2]).toBe(config);
  });

  it('makes no direct request when proxy config resolution fails', async () => {
    resolveProxyConfig.mockRejectedValue(new Error('config unavailable'));
    const directFetch = vi.spyOn(globalThis, 'fetch');
    const service = new GeminiLiveBootstrapService({
      getKeysImpl: async () => ['key-1', 'key-2'],
      getLegacyKeyImpl: async () => '',
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(proxyManager.fetch).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('stops after exactly one proxy request when the proxy path fails', async () => {
    resolveProxyConfig.mockResolvedValue({ enabled: true });
    proxyManager.fetch.mockRejectedValue(new Error('proxy unreachable'));
    const directFetch = vi.spyOn(globalThis, 'fetch');
    const service = new GeminiLiveBootstrapService({
      getKeysImpl: async () => ['key-1', 'key-2'],
      getLegacyKeyImpl: async () => '',
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintEphemeralToken('en')).resolves.toBeNull();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(directFetch).not.toHaveBeenCalled();
  });
});
