import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
vi.mock('@/shared/storage/core/StorageCore.js', () => ({ storageManager: { getFresh: vi.fn() } }));
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { storageManager } from '@/shared/storage/core/StorageCore.js';
import {
  OPENAI_REALTIME_TRANSLATE_MODEL,
  OPENAI_REALTIME_TRANSLATIONS_CLIENT_SECRETS_ENDPOINT,
  OPENAI_REALTIME_WHISPER_MODEL,
  OPENAI_REALTIME_ORIGINAL_TRANSCRIPT_SETTING,
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

function createService({
  keys = ['key-1'],
  fetchImpl,
  logger,
  originalTranscriptEnabled = vi.fn().mockResolvedValue(false),
} = {}) {
  const calls = [];
  const impl = fetchImpl || (async (url, options) => {
    calls.push({ url, options });
    return okMint();
  });
  const service = new OpenAIRealtimeBootstrapService({
    getKeysImpl: async () => keys,
    getOriginalTranscriptEnabledImpl: originalTranscriptEnabled,
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

  it('reports configured credentials without network use or key exposure', async () => {
    const fetchImpl = vi.fn();
    const { service } = createService({
      keys: [' openai-key-secret ', 'openai-key-secret', ' ', 'second-key'],
      fetchImpl,
    });

    await expect(service.hasConfiguredCredentials()).resolves.toBe(true);
    await expect(service._eligibleKeys()).resolves.toEqual(['openai-key-secret', 'second-key']);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(await service.hasConfiguredCredentials())).not.toContain('openai-key-secret');
  });

  it('returns false for empty or failed key stores without network use', async () => {
    const fetchImpl = vi.fn();
    const { service } = createService({ keys: [], fetchImpl });
    await expect(service.hasConfiguredCredentials()).resolves.toBe(false);

    const whitespaceOnly = createService({ keys: [' ', '\t'], fetchImpl }).service;
    await expect(whitespaceOnly.hasConfiguredCredentials()).resolves.toBe(false);

    const failedStore = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => { throw new Error('key-store-secret'); },
      fetchImpl,
    });
    await expect(failedStore.hasConfiguredCredentials()).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
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

  it('logs separate preference, key retrieval, and client-secret request timings only in debug mode', async () => {
    let now = 0;
    const logger = { isDebugEnabled: () => true, debug: vi.fn() };
    const { service } = createService({
      logger,
      originalTranscriptEnabled: vi.fn(async () => { now += 4; return false; }),
      keys: ['private-key'],
      fetchImpl: vi.fn(async () => { now += 6; return okMint('private-secret'); }),
    });
    service.performanceNow = () => now++;

    await expect(service.mintClientSecret('en', { mediaSequence: 77 })).resolves.toBe('private-secret');

    const logs = logger.debug.mock.calls.map(([line]) => line);
    expect(logs.map(line => line.match(/stage=([^ ]+)/)?.[1])).toEqual([
      'original_transcript_setting', 'eligible_keys', 'client_secret_http_request',
    ]);
    expect(logs.every(line => !line.includes('private-key') && !line.includes('private-secret'))).toBe(true);
    expect(logs.every(line => line.includes('generation=77'))).toBe(true);

    const disabledLogger = { isDebugEnabled: () => false, debug: vi.fn() };
    const disabled = createService({ logger: disabledLogger });
    await disabled.service.mintClientSecret('en');
    expect(disabledLogger.debug).not.toHaveBeenCalled();
  });

  it('attributes a rejected mint request to the request stage without logging request data', async () => {
    let now = 0;
    const logger = { isDebugEnabled: () => true, debug: vi.fn() };
    const { service } = createService({
      logger,
      originalTranscriptEnabled: vi.fn().mockResolvedValue(false),
      keys: ['private-api-key'],
      fetchImpl: vi.fn(async () => { throw new Error('private request body'); }),
    });
    service.performanceNow = () => now++;

    await expect(service.mintClientSecret('en')).resolves.toBeNull();
    const logs = logger.debug.mock.calls.map(([line]) => line);
    const requestTiming = logs.find(line => line.includes('stage=client_secret_http_request'));
    expect(requestTiming).toContain('outcome=failure');
    expect(logs.join('\n')).not.toContain('private-api-key');
    expect(logs.join('\n')).not.toContain('private request body');
  });

  it('logs each failed and successful failover request with its own attempt and duration', async () => {
    let now = 0;
    const logger = { isDebugEnabled: () => true, debug: vi.fn() };
    const fetchImpl = vi.fn()
      .mockImplementationOnce(async () => {
        now += 7;
        return failMint(401, openAIError({ message: 'private response body text' }));
      })
      .mockImplementationOnce(async () => { now += 13; return okMint('private-client-secret'); });
    const { service } = createService({
      logger,
      keys: ['private-first-key', 'private-second-key'],
      fetchImpl,
    });
    service.performanceNow = () => now;

    await expect(service.mintClientSecret('en')).resolves.toBe('private-client-secret');

    const requests = logger.debug.mock.calls.map(([line]) => line)
      .filter(line => line.includes('stage=client_secret_http_request'));
    expect(requests).toHaveLength(2);
    expect(requests[0]).toContain('attempt=1');
    expect(requests[0]).toContain('durationMs=7');
    expect(requests[0]).toContain('outcome=failure');
    expect(requests[1]).toContain('attempt=2');
    expect(requests[1]).toContain('durationMs=13');
    expect(requests[1]).toContain('outcome=success');
    expect(logger.debug.mock.calls.map(([line]) => line).join('\n'))
      .not.toMatch(/private-first-key|private-second-key|private-client-secret|private response body text|gpt-realtime-translate/);
  });

  it('keeps concurrent mint timing labels local and marks credential validation without a media generation', async () => {
    const logger = { isDebugEnabled: () => true, debug: vi.fn() };
    const { service } = createService({ logger });
    let now = 0;
    service.performanceNow = () => now++;

    await Promise.all([
      service.mintClientSecret('en', { mediaSequence: 101 }),
      service.mintClientSecret('fr', { mediaSequence: 202 }),
    ]);

    const requestLogs = logger.debug.mock.calls.map(([line]) => line)
      .filter(line => line.includes('stage=client_secret_http_request'));
    expect(requestLogs).toHaveLength(2);
    expect(requestLogs.map(line => line.match(/generation=(\d+)/)?.[1]).sort()).toEqual(['101', '202']);
    expect(requestLogs.every(line => line.includes('attempt=1'))).toBe(true);

    logger.debug.mockClear();
    await service.validateCredential('private-draft-key', 'en');
    const validationLogs = logger.debug.mock.calls.map(([line]) => line);
    expect(validationLogs.every(line => line.includes('operation=credential_validation'))).toBe(true);
    expect(validationLogs.every(line => line.includes('generation=none'))).toBe(true);
    expect(validationLogs.join('\n')).not.toContain('private-draft-key');
  });

  it('retains input transcription when Original subtitles are enabled', async () => {
    const read = vi.fn().mockResolvedValue(true);
    const { service, calls } = createService({ originalTranscriptEnabled: read });

    await expect(service.mintClientSecret('en-US')).resolves.toBe('ek_test_secret');
    expect(read).toHaveBeenCalledOnce();
    expect(JSON.parse(calls[0].options.body).session.audio.input).toEqual({
      transcription: { model: OPENAI_REALTIME_WHISPER_MODEL },
    });
  });

  it('uses only the OpenAI-specific Original subtitles setting', async () => {
    expect(OPENAI_REALTIME_ORIGINAL_TRANSCRIPT_SETTING)
      .toBe('LIVE_DUBBING_SHOW_ORIGINAL_TRANSCRIPT_OPENAI');

    const geminiOnly = createService({ originalTranscriptEnabled: vi.fn().mockResolvedValue(false) });
    await geminiOnly.service.mintClientSecret('en-US');
    expect(JSON.parse(geminiOnly.calls[0].options.body).session.audio.input).toBeUndefined();

    const openAIEnabled = createService({ originalTranscriptEnabled: vi.fn().mockResolvedValue(true) });
    await openAIEnabled.service.mintClientSecret('en-US');
    expect(JSON.parse(openAIEnabled.calls[0].options.body).session.audio.input.transcription.model)
      .toBe(OPENAI_REALTIME_WHISPER_MODEL);

    storageManager.getFresh.mockResolvedValue({
      LIVE_DUBBING_SHOW_ORIGINAL_TRANSCRIPT_GEMINI: true,
    });
    const calls = [];
    const defaultService = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      fetchImpl: async (url, options) => {
        calls.push(options);
        return okMint();
      },
    });
    await defaultService.mintClientSecret('en-US');
    expect(storageManager.getFresh).toHaveBeenCalledWith({
      LIVE_DUBBING_SHOW_ORIGINAL_TRANSCRIPT_OPENAI: false,
    });
    expect(JSON.parse(calls[0].body).session.audio.input).toBeUndefined();
  });

  it('fails closed when the Original subtitles preference read fails or is not boolean true', async () => {
    const failed = createService({ originalTranscriptEnabled: vi.fn().mockRejectedValue(new Error('storage')) });
    await failed.service.mintClientSecret('en');
    expect(JSON.parse(failed.calls[0].options.body).session.audio.input).toBeUndefined();

    const malformed = createService({ originalTranscriptEnabled: vi.fn().mockResolvedValue('true') });
    await malformed.service.mintClientSecret('en');
    expect(JSON.parse(malformed.calls[0].options.body).session.audio.input).toBeUndefined();
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

  it('reads the Original subtitles preference once and reuses the snapshot during failover', async () => {
    const read = vi.fn().mockResolvedValue(true);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(failMint(401))
      .mockResolvedValueOnce(okMint('ek_second_secret'));
    const { service } = createService({ keys: ['bad-key', 'good-key'], fetchImpl, originalTranscriptEnabled: read });

    await expect(service.mintClientSecret('es')).resolves.toBe('ek_second_secret');
    expect(read).toHaveBeenCalledOnce();
    for (const [, options] of fetchImpl.mock.calls) {
      expect(JSON.parse(options.body).session.audio.input.transcription.model)
        .toBe(OPENAI_REALTIME_WHISPER_MODEL);
    }
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
    let now = 0;
    const debug = vi.fn();
    const service = new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => ['key-1'],
      logger: { isDebugEnabled: () => true, debug, warn: () => {}, error: () => {} },
      performanceNow: () => now++,
    });

    await expect(service.mintClientSecret('en')).resolves.toBe('ek_proxy_secret');
    expect(resolveProxyConfig).toHaveBeenCalledOnce();
    expect(proxyManager.fetch).toHaveBeenCalledOnce();
    expect(proxyManager.fetch.mock.calls[0][2]).toBe(config);
    expect(proxyManager.fetch.mock.calls[0]).toHaveLength(3);
    expect(directFetch).not.toHaveBeenCalled();
    expect(debug.mock.calls.map(([line]) => line.match(/stage=([^ ]+)/)?.[1])).toEqual([
      'original_transcript_setting', 'eligible_keys', 'proxy_config_resolution', 'client_secret_http_request',
    ]);
  });
});
