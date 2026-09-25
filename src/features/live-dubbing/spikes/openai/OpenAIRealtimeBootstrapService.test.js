import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import {
  OPENAI_REALTIME_TRANSLATE_MODEL,
  OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT,
  OPENAI_REALTIME_WHISPER_MODEL,
  OpenAIRealtimeBootstrapService,
} from './OpenAIRealtimeBootstrapService.js';

function okMint(value = 'ek_test_secret', expires_at = 1750000000) {
  return { ok: true, status: 200, json: async () => ({ value, expires_at, session: { id: 'sess_1' } }) };
}

function failMint(status = 401) {
  return { ok: false, status, json: async () => ({}) };
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

describe('OpenAIRealtimeBootstrapService (SPIKE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mints with the verbatim endpoint, method, auth, and body shape', async () => {
    const { service, calls } = createService({ keys: ['key-1'] });

    const bootstrap = await service.mintClientSecret('es');

    expect(bootstrap).toMatchObject({ targetLanguage: 'es', model: OPENAI_REALTIME_TRANSLATE_MODEL });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT);
    expect(calls[0].options.method).toBe('POST');
    expect(calls[0].options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer key-1',
    });
    expect(JSON.parse(calls[0].options.body)).toEqual({
      expires_after: { anchor: 'created_at', seconds: 600 },
      session: {
        model: OPENAI_REALTIME_TRANSLATE_MODEL,
        audio: {
          input: {
            transcription: { model: OPENAI_REALTIME_WHISPER_MODEL },
            noise_reduction: null,
          },
          output: { language: 'es' },
        },
      },
    });
  });

  it('returns a secret-only bootstrap bound to language and model', async () => {
    const { service } = createService({ keys: ['live-key-secret'] });

    const bootstrap = await service.mintClientSecret('fr');

    expect(bootstrap.secret).toBe('ek_test_secret');
    expect(bootstrap.secret).not.toContain('live-key-secret');
    expect(bootstrap.targetLanguage).toBe('fr');
    expect(bootstrap.model).toBe(OPENAI_REALTIME_TRANSLATE_MODEL);
    expect(bootstrap.expiresAt).toBe(1750000000);
    expect(Object.keys(bootstrap).sort()).toEqual(['expiresAt', 'model', 'secret', 'targetLanguage']);
  });

  it('reports a null scalar expiresAt when the mint omits or corrupts it', async () => {
    const omitted = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ value: 'ek_test_secret' }) }),
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    await expect(omitted.mintClientSecret('es')).resolves.toMatchObject({ expiresAt: null });

    const corrupt = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      fetchImpl: async () => okMint('ek_test_secret', 'soon'),
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });
    await expect(corrupt.mintClientSecret('es')).resolves.toMatchObject({ expiresAt: null });
  });

  it('reuses the single first key with no rotation on failure', async () => {
    const fetchImpl = vi.fn(async () => failMint(401));
    const { service } = createService({ keys: ['first-key', 'second-key'], fetchImpl });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer first-key');
  });

  it('returns null without network use when no keys are configured', async () => {
    const fetchImpl = vi.fn(async () => okMint());
    const { service } = createService({ keys: [], fetchImpl });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null without network use for a malformed language', async () => {
    const fetchImpl = vi.fn(async () => okMint());
    const { service } = createService({ keys: ['key-1'], fetchImpl });

    await expect(service.mintClientSecret('')).resolves.toBeNull();
    await expect(service.mintClientSecret(null)).resolves.toBeNull();
    await expect(service.mintClientSecret('not a language!!')).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns null when the transport throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns null on non-ok responses without trying another key', async () => {
    const fetchImpl = vi.fn(async () => failMint(500));
    const { service } = createService({ keys: ['key-1', 'key-2'], fetchImpl });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('returns null on malformed success payloads', async () => {
    const missingValue = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const { service: missingService } = createService({ keys: ['key-1'], fetchImpl: missingValue });
    await expect(missingService.mintClientSecret('es')).resolves.toBeNull();
    expect(missingValue).toHaveBeenCalledOnce();

    const unreadable = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected end of JSON input'); },
    }));
    const { service: unreadableService } = createService({ keys: ['key-1'], fetchImpl: unreadable });
    await expect(unreadableService.mintClientSecret('es')).resolves.toBeNull();
    expect(unreadable).toHaveBeenCalledOnce();
  });

  it('never exposes keys or secrets through results or logs', async () => {
    const debug = vi.fn();
    const fetchImpl = vi.fn(async (url, options) => {
      throw new Error(`boom with ${options.headers.Authorization} inside`);
    });
    const { service } = createService({
      keys: ['live-key-secret'],
      fetchImpl,
      logger: { debug, warn: () => {}, error: () => {} },
    });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(JSON.stringify(debug.mock.calls)).not.toContain('live-key-secret');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('ek_');
  });

  it('mints through the proxy infrastructure on the production path', async () => {
    const config = { enabled: false };
    resolveProxyConfig.mockResolvedValue(config);
    proxyManager.fetch.mockResolvedValue(okMint('ek_proxy_secret', null));
    const service = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintClientSecret('es')).resolves.toMatchObject({ secret: 'ek_proxy_secret' });
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(proxyManager.fetch.mock.calls[0][0]).toBe(OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT);
    expect(proxyManager.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer key-1');
    expect(proxyManager.fetch.mock.calls[0][2]).toBe(config);
  });

  it('makes no direct request when proxy config resolution fails', async () => {
    resolveProxyConfig.mockRejectedValue(new Error('config unavailable'));
    const directFetch = vi.spyOn(globalThis, 'fetch');
    const service = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      logger: { debug: () => {}, warn: () => {}, error: () => {} },
    });

    await expect(service.mintClientSecret('es')).resolves.toBeNull();
    expect(proxyManager.fetch).not.toHaveBeenCalled();
    expect(directFetch).not.toHaveBeenCalled();
  });

  it('never persists the secret to storage', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const source = await readFile(join(
      process.cwd(),
      'src/features/live-dubbing/spikes/openai/OpenAIRealtimeBootstrapService.js',
    ), 'utf8');

    expect(source).not.toContain('storageManager');
    expect(source).not.toContain('chrome.storage');
    expect(source).not.toContain('translations/calls');
  });
});
