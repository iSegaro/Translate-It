import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/proxy/ProxySettings.js', () => ({ resolveProxyConfig: vi.fn() }));
vi.mock('@/shared/proxy/ProxyManager.js', () => ({ proxyManager: { fetch: vi.fn() } }));
vi.mock('./GeminiLiveBootstrapService.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, geminiLiveBootstrapService: { validateCredential: vi.fn() } };
});
vi.mock('./OpenAIRealtimeBootstrapService.js', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, openAIRealtimeBootstrapService: { validateCredential: vi.fn() } };
});

import browser from 'webextension-polyfill';
import { ApiKeyManager } from '@/features/translation/providers/ApiKeyManager.js';
import { GeminiLiveBootstrapService } from './GeminiLiveBootstrapService.js';
import { OpenAIRealtimeBootstrapService } from './OpenAIRealtimeBootstrapService.js';
import { geminiLiveBootstrapService } from './GeminiLiveBootstrapService.js';
import { openAIRealtimeBootstrapService } from './OpenAIRealtimeBootstrapService.js';
import { handleLiveDubbingValidateCredential } from './handlers.js';
import { liveDubbingCoordinator } from './LiveDubbingCoordinator.js';

const silentLogger = { debug: () => {}, warn: () => {}, error: () => {} };

function googleErrorBody({ message = 'Request failed', status = 'INVALID_ARGUMENT', reasons = [] } = {}) {
  return { error: { code: 400, message, status, details: reasons.map(reason => ({ reason })) } };
}

function openAIError({ type = 'invalid_request_error', code = null, message = 'Request failed' } = {}) {
  return { error: { type, code, message } };
}

/** Stored-key access must throw if touched: validation owns only the draft key. */
function unreadableKeys() {
  return {
    getKeysImpl: async () => { throw new Error('stored keys must not be read'); },
    getLegacyKeyImpl: async () => { throw new Error('legacy key must not be read'); },
  };
}

describe('Gemini validateCredential', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  function createService(fetchImpl) {
    return new GeminiLiveBootstrapService({
      ...unreadableKeys(),
      fetchImpl,
      logger: silentLogger,
    });
  }

  it('verifies a draft key with one mint attempt and discards the token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ name: 'auth_tokens/ephemeral-1' }) }));
    const service = createService(fetchImpl);

    const result = await service.validateCredential('draft-gemini-key', 'en');

    expect(result).toEqual({ ok: true, valid: true, reason: 'VALID' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers['x-goog-api-key']).toBe('draft-gemini-key');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.uses).toBe(1);
    expect(body.bidiGenerateContentSetup.generationConfig.translationConfig.targetLanguageCode).toBe('en');
    expect(JSON.stringify(result)).not.toContain('auth_tokens/ephemeral-1');
    expect(JSON.stringify(result)).not.toContain('draft-gemini-key');
  });

  it('makes exactly one attempt on auth failure without failover', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('bad-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'AUTH_INVALID',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports explicit permission denial as a capability rejection, not an invalid key', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => googleErrorBody({
        message: 'Permission denied on the key.',
        status: 'PERMISSION_DENIED',
        reasons: ['PERMISSION_DENIED'],
      }),
    }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('denied-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'FORBIDDEN',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ['quota exhaustion', 429, googleErrorBody({ message: 'Quota exceeded.', status: 'RESOURCE_EXHAUSTED', reasons: ['QUOTA_EXCEEDED'] }), 'QUOTA_EXCEEDED'],
    ['rate limiting', 429, googleErrorBody({ message: 'Too many requests.', status: 'RESOURCE_EXHAUSTED' }), 'RATE_LIMITED'],
    ['quota exhaustion on forbidden response', 403, googleErrorBody({ message: 'Quota exceeded.', reasons: ['QUOTA_EXCEEDED'] }), 'QUOTA_EXCEEDED'],
    ['rate limiting on forbidden response', 403, googleErrorBody({ message: 'Rate limit exceeded.' }), 'RATE_LIMITED'],
    ['generic forbidden response', 403, googleErrorBody(), 'FORBIDDEN'],
    ['insufficient balance', 402, googleErrorBody(), 'INSUFFICIENT_BALANCE'],
  ])('maps %s to an indeterminate usage reason', async (_label, status, body, reason) => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status, json: async () => body }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('limited-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('never classifies network failure or 5xx as an invalid key', async () => {
    const transport = createService(vi.fn().mockRejectedValue(new Error('network down')));
    await expect(transport.validateCredential('draft-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'NETWORK_ERROR',
    });

    const serving = createService(vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const result = await serving.validateCredential('draft-key', 'en');
    expect(result).toEqual({ ok: true, valid: false, reason: 'SERVER_ERROR' });
    expect(result.reason).not.toBe('AUTH_INVALID');
  });

  it('treats malformed success payloads as indeterminate without failover', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('draft-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects unsupported language and missing credentials without network use', async () => {
    const fetchImpl = vi.fn();
    const service = createService(fetchImpl);

    await expect(service.validateCredential('draft-key', 'xx')).resolves.toEqual({
      ok: true, valid: false, reason: 'UNSUPPORTED_LANGUAGE',
    });
    await expect(service.validateCredential('  ', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'MISSING_CREDENTIAL',
    });
    await expect(service.validateCredential(null, 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'MISSING_CREDENTIAL',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never reads, reorders, or promotes stored keys', async () => {
    const getKeys = vi.spyOn(ApiKeyManager, 'getKeys');
    const promoteKey = vi.spyOn(ApiKeyManager, 'promoteKey');
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ name: 'auth_tokens/t' }) }));
    const service = createService(fetchImpl);

    await service.validateCredential('draft-key', 'en');

    expect(getKeys).not.toHaveBeenCalled();
    expect(promoteKey).not.toHaveBeenCalled();
  });
});

describe('OpenAI validateCredential', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); });

  function createService(fetchImpl) {
    return new OpenAIRealtimeBootstrapService({
      getKeysImpl: async () => { throw new Error('stored keys must not be read'); },
      getOriginalTranscriptEnabledImpl: async () => false,
      fetchImpl,
      logger: silentLogger,
    });
  }

  it('verifies a draft key with one secret mint and discards the secret', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: 'ek_secret-1' }) }));
    const service = createService(fetchImpl);

    const result = await service.validateCredential('draft-openai-key', 'en-US');

    expect(result).toEqual({ ok: true, valid: true, reason: 'VALID' });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer draft-openai-key');
    expect(JSON.stringify(result)).not.toContain('ek_secret-1');
    expect(JSON.stringify(result)).not.toContain('draft-openai-key');
  });

  it('makes exactly one attempt on auth failure without failover', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 401, json: async () => openAIError({ code: 'invalid_api_key' }),
    }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('bad-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'AUTH_INVALID',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports forbidden as a capability rejection, not an invalid key', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false, status: 403, json: async () => openAIError({ type: 'permissions_error', code: 'organization_not_verified' }),
    }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('draft-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'FORBIDDEN',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    ['quota exhaustion', 429, openAIError({ type: 'insufficient_quota', code: 'insufficient_quota' }), 'QUOTA_EXCEEDED'],
    ['rate limiting', 429, openAIError({ code: 'rate_limit_exceeded' }), 'RATE_LIMITED'],
    ['quota exhaustion on forbidden response', 403, openAIError({ type: 'insufficient_quota', code: 'insufficient_quota' }), 'QUOTA_EXCEEDED'],
    ['rate limiting on forbidden response', 403, openAIError({ code: 'rate_limit_exceeded' }), 'RATE_LIMITED'],
    ['generic forbidden response', 403, openAIError(), 'FORBIDDEN'],
    ['insufficient balance', 402, openAIError(), 'INSUFFICIENT_BALANCE'],
  ])('maps %s to an indeterminate usage reason', async (_label, status, body, reason) => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status, json: async () => body }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('limited-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('never classifies network failure or 5xx as an invalid key', async () => {
    const transport = createService(vi.fn().mockRejectedValue(new Error('network down')));
    await expect(transport.validateCredential('draft-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'NETWORK_ERROR',
    });

    const serving = createService(vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const result = await serving.validateCredential('draft-key', 'en');
    expect(result).toEqual({ ok: true, valid: false, reason: 'SERVER_ERROR' });
    expect(result.reason).not.toBe('AUTH_INVALID');
  });

  it('treats malformed success payloads as indeterminate without failover', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    const service = createService(fetchImpl);

    await expect(service.validateCredential('draft-key', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'INVALID_RESPONSE',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('rejects unsupported language and missing credentials without network use', async () => {
    const fetchImpl = vi.fn();
    const service = createService(fetchImpl);

    await expect(service.validateCredential('draft-key', 'not a language!!')).resolves.toEqual({
      ok: true, valid: false, reason: 'UNSUPPORTED_LANGUAGE',
    });
    await expect(service.validateCredential('', 'en')).resolves.toEqual({
      ok: true, valid: false, reason: 'MISSING_CREDENTIAL',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never reads or promotes stored keys', async () => {
    const getKeys = vi.spyOn(ApiKeyManager, 'getKeys');
    const promoteKey = vi.spyOn(ApiKeyManager, 'promoteKey');
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ value: 'ek_s' }) }));
    const service = createService(fetchImpl);

    await service.validateCredential('draft-key', 'en');

    expect(getKeys).not.toHaveBeenCalled();
    expect(promoteKey).not.toHaveBeenCalled();
  });
});

describe('handleLiveDubbingValidateCredential', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function trustedSender(path, withTab = false) {
    vi.stubGlobal('__BROWSER__', 'chrome');
    browser.runtime.id = 'extension-id';
    browser.runtime.getURL = (urlPath = '') => `chrome-extension://extension-id/${urlPath}`;
    return {
      id: 'extension-id',
      url: `chrome-extension://extension-id/${path}`,
      ...(withTab ? { tab: { id: 7 } } : {}),
    };
  }

  it('rejects untrusted senders without touching a bootstrap service', async () => {
    trustedSender('src/html/popup.html');
    const pageSender = { id: 'extension-id', url: 'https://example.test/page', tab: { id: 1 } };

    await expect(handleLiveDubbingValidateCredential({
      data: { providerId: 'gemini', apiKey: 'draft', targetLanguage: 'en' },
    }, pageSender)).resolves.toEqual({ success: false, error: 'LIVE_DUBBING_UNAUTHORIZED' });
    expect(geminiLiveBootstrapService.validateCredential).not.toHaveBeenCalled();
    expect(openAIRealtimeBootstrapService.validateCredential).not.toHaveBeenCalled();
  });

  it.each([
    ['Popup', 'src/html/popup.html', false],
    ['Sidepanel', 'src/html/sidepanel.html', false],
    ['Options', 'src/html/options.html', false],
    ['tab-bound Options', 'src/html/options.html', true],
  ])('accepts a trusted %s sender for Gemini', async (_label, path, withTab) => {
    geminiLiveBootstrapService.validateCredential.mockResolvedValue({ ok: true, valid: true, reason: 'VALID' });

    const result = await handleLiveDubbingValidateCredential({
      data: { providerId: 'gemini', apiKey: 'draft-gemini-key', targetLanguage: 'en' },
    }, trustedSender(path, withTab));

    expect(result).toEqual({ ok: true, valid: true, reason: 'VALID' });
    expect(geminiLiveBootstrapService.validateCredential).toHaveBeenCalledWith('draft-gemini-key', 'en');
    expect(openAIRealtimeBootstrapService.validateCredential).not.toHaveBeenCalled();
  });

  it('routes OpenAI requests to the OpenAI bootstrap service', async () => {
    openAIRealtimeBootstrapService.validateCredential.mockResolvedValue({ ok: true, valid: false, reason: 'AUTH_INVALID' });

    const result = await handleLiveDubbingValidateCredential({
      data: { providerId: 'openai', apiKey: 'draft-openai-key', targetLanguage: 'en-US' },
    }, trustedSender('src/html/sidepanel.html'));

    expect(result).toEqual({ ok: true, valid: false, reason: 'AUTH_INVALID' });
    expect(openAIRealtimeBootstrapService.validateCredential).toHaveBeenCalledWith('draft-openai-key', 'en-US');
    expect(geminiLiveBootstrapService.validateCredential).not.toHaveBeenCalled();
  });

  it('rejects unknown providers without a bootstrap attempt', async () => {
    const result = await handleLiveDubbingValidateCredential({
      data: { providerId: 'deepl', apiKey: 'draft', targetLanguage: 'en' },
    }, trustedSender('src/html/popup.html'));

    expect(result).toEqual({ ok: true, valid: false, reason: 'UNSUPPORTED_PROVIDER' });
    expect(geminiLiveBootstrapService.validateCredential).not.toHaveBeenCalled();
    expect(openAIRealtimeBootstrapService.validateCredential).not.toHaveBeenCalled();
  });

  it('creates no session and never leaks the draft key or ephemeral secret', async () => {
    const start = vi.spyOn(liveDubbingCoordinator, 'start');
    const stop = vi.spyOn(liveDubbingCoordinator, 'stop');
    const getStatus = vi.spyOn(liveDubbingCoordinator, 'getStatus');
    const getKeys = vi.spyOn(ApiKeyManager, 'getKeys');
    geminiLiveBootstrapService.validateCredential.mockResolvedValue({ ok: true, valid: true, reason: 'VALID' });

    const result = await handleLiveDubbingValidateCredential({
      data: { providerId: 'gemini', apiKey: 'super-secret-draft', targetLanguage: 'en' },
    }, trustedSender('src/html/popup.html'));

    expect(Object.keys(result).sort()).toEqual(['ok', 'reason', 'valid']);
    expect(JSON.stringify(result)).not.toContain('super-secret-draft');
    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
    expect(getStatus).not.toHaveBeenCalled();
    expect(getKeys).not.toHaveBeenCalled();
  });

  it('returns unsupported outside Chrome', async () => {
    const sender = trustedSender('src/html/popup.html');
    vi.stubGlobal('__BROWSER__', 'firefox');

    await expect(handleLiveDubbingValidateCredential({
      data: { providerId: 'gemini', apiKey: 'draft', targetLanguage: 'en' },
    }, sender)).resolves.toEqual({
      success: false, error: 'LIVE_DUBBING_UNSUPPORTED',
    });
  });
});
