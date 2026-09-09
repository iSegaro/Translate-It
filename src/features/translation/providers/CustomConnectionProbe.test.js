import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    fetch: vi.fn(),
    setConfig: vi.fn(),
    testConnection: vi.fn(),
  },
}));

vi.mock('@/shared/proxy/ProxySettings.js', () => ({
  getProxySettingsAsync: vi.fn().mockResolvedValue({}),
  resolveProxyConfig: vi.fn().mockResolvedValue({ proxied: true }),
}));

vi.mock('@/shared/config/config.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCustomApiKeysAsync: vi.fn().mockResolvedValue(['test-key']),
    getCustomApiUrlAsync: vi.fn().mockResolvedValue('https://custom-api.com/v1/chat/completions'),
    getCustomApiModelAsync: vi.fn().mockResolvedValue('custom-model'),
  };
});

vi.mock('../core/TranslationStatsManager.js', () => ({
  statsManager: {
    recordRequest: vi.fn(() => ({ globalCallId: 1, sessionCallId: 1 })),
    recordError: vi.fn(),
    recordSuccess: vi.fn(),
  },
}));

vi.mock('./ApiKeyManager.js', () => ({
  ApiKeyManager: {
    getKeys: vi.fn(),
    promoteKey: vi.fn(),
    shouldFailover: vi.fn(),
  },
}));

import { proxyManager } from '@/shared/proxy/ProxyManager.js';
import { resolveProxyConfig } from '@/shared/proxy/ProxySettings.js';
import { statsManager } from '../core/TranslationStatsManager.js';
import { ApiKeyManager } from './ApiKeyManager.js';
import { getCustomApiUrlAsync, getCustomApiModelAsync } from '@/shared/config/config.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { CustomProvider } from './CustomProvider.js';
import { probeCustomConnection, firstCustomProbeKey, isValidProbeCompletion } from './CustomConnectionProbe.js';
import { AIResponseParser } from './utils/AIResponseParser.js';
import { handleTestCustomConnection } from '@/core/background/handlers/vue-integration/handleTestCustomConnection.js';
import {
  getCustomResponseFormatSupport,
  setCustomResponseFormatSupport,
  clearCustomResponseFormatSupportCache,
} from './CustomResponseFormatCapability.js';

const URL = 'https://custom-api.com/v1/chat/completions';
const MODELS_URL = 'https://custom-api.com/v1/models';
const MODEL = 'custom-model';

const jsonResponse = (ok, status, body, statusText = 'Bad Request') => ({
  ok,
  status,
  statusText,
  headers: new Map([['content-type', 'application/json']]),
  json: async () => body,
  clone() { return this; },
});

const completionBody = (content = '{"probe":"ok"}') => ({
  choices: [{ message: { content } }],
});

const modelBody = (modelName, content = '{"probe":"ok"}') => ({
  ...(modelName != null ? { model: modelName } : {}),
  choices: [{ message: { content } }],
});

const authOf = (call) => call[1]?.headers?.Authorization;

describe('CustomConnectionProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch queues per test: unconsumed once-queues must never leak
    // across tests (clearAllMocks keeps implementations/queues).
    proxyManager.fetch.mockReset();
    clearCustomResponseFormatSupportCache();
  });

  it('works keyless without an Authorization header', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: '' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_success',
      responseFormat: 'supported',
      usable: true,
    });
    expect(authOf(proxyManager.fetch.mock.calls[0])).toBeUndefined();
    expect(authOf(proxyManager.fetch.mock.calls[1])).toBeUndefined();
    expect(resolveProxyConfig).toHaveBeenCalled();
  });

  it('sends the first key as Bearer auth', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k1\nk2' });

    expect(authOf(proxyManager.fetch.mock.calls[0])).toBe('Bearer k1');
    expect(firstCustomProbeKey('k1\nk2')).toBe('k1');
    expect(firstCustomProbeKey('')).toBe('');
  });

  it('reports unreachable when the baseline fetch throws', async () => {
    proxyManager.fetch.mockRejectedValueOnce(new TypeError('NetworkError: Failed to fetch'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'unreachable',
      messageKey: 'custom_api_connection_unreachable',
      usable: false,
      responseFormat: 'unknown',
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it.each([401, 403])('reports authentication for HTTP %s', async (status) => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(false, status, { error: { message: 'Unauthorized' } }, 'Unauthorized'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'bad' });

    expect(report).toMatchObject({
      state: 'auth_failed',
      messageKey: 'custom_api_connection_auth_failed',
      usable: false,
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('reports model_unavailable directly for an explicit model_not_found code', async () => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(
      false,
      404,
      { error: { code: 'model_not_found', message: `model ${MODEL} not found` } },
      'Not Found',
    ));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'model_unavailable',
      messageKey: 'api_test_custom_model_not_found',
      params: { model: MODEL },
      usable: false,
    });
    // Explicit evidence decides without consulting /models.
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('reports model_unavailable for a message naming the configured model', async () => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(
      false,
      400,
      { error: { message: `Invalid model: ${MODEL} does not exist` } },
    ));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'model_unavailable',
      messageKey: 'api_test_custom_model_not_found',
      params: { model: MODEL },
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports model_unavailable for an ambiguous 404 with /models evidence', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(false, 404, { error: { message: 'Not found' } }, 'Not Found'))
      .mockResolvedValueOnce(jsonResponse(true, 200, { data: [{ id: 'other-model' }] }, 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'model_unavailable',
      messageKey: 'api_test_custom_model_not_found',
      params: { model: MODEL },
    });
    expect(proxyManager.fetch.mock.calls[1][0]).toBe(MODELS_URL);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('reports endpoint failure for a generic 404 when /models is inconclusive', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(false, 404, { error: { message: 'Not found' } }, 'Not Found'))
      .mockResolvedValueOnce(jsonResponse(false, 404, {}, 'Not Found'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'request_failed',
      messageKey: 'custom_api_connection_request_failed',
      params: { status: 404 },
      usable: false,
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
  });

  it('reports endpoint failure for a generic 404 when the model exists', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(false, 404, { error: { message: 'Not found' } }, 'Not Found'))
      .mockResolvedValueOnce(jsonResponse(true, 200, { data: [{ id: MODEL }] }, 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'request_failed',
      messageKey: 'custom_api_connection_request_failed',
      params: { status: 404 },
    });
  });

  it('never fails overall alone when /models is unreachable after an ambiguous 404', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(false, 404, { error: { message: 'Not found' } }, 'Not Found'))
      .mockRejectedValueOnce(new TypeError('NetworkError'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'request_failed',
      messageKey: 'custom_api_connection_request_failed',
      params: { status: 404 },
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
  });

  it('skips /models when the URL has no derivable models endpoint', async () => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(false, 404, { error: { message: 'Not found' } }, 'Not Found'));

    const report = await probeCustomConnection({ apiUrl: 'https://other.example/api', apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({ state: 'request_failed', params: { status: 404 } });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
  });

  it('reports completion failure for choice-less 200 responses', async () => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(true, 200, { choices: [] }, 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'completion_failed',
      messageKey: 'custom_api_connection_completion_failed',
      fallbackStructured: 'unknown',
      usable: false,
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it.each([
    ['plain prose', 'hello world'],
    ['prose containing the words', 'probe failed, not ok'],
    ['wrong probe value', '{"probe":"not ok"}'],
    ['malformed JSON with both words', '{probe: "ok"}'],
    ['JSON array', '["probe", "ok"]'],
    ['bare scalar', '"ok"'],
  ])('records unsupported fallback and continues past %s', async (_label, content) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(content), 'OK'))
      .mockResolvedValueOnce(jsonResponse(false, 500, { error: { message: 'Server busy' } }, 'Server Error'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    // Usable text that fails the structured contract, then an inconclusive
    // Probe B: degraded, never fully usable, cache untouched.
    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_structured_invalid',
      fallbackStructured: 'unsupported',
      responseFormat: 'unknown',
      usable: false,
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('marks usable when an unsupported fallback meets a supported valid Probe B', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody('hello world'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_success',
      fallbackStructured: 'unsupported',
      responseFormat: 'supported',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
  });

  it('marks unusable when an unsupported fallback meets an unsupported Probe B', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody('hello world'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(
        false,
        400,
        { error: "'response_format.type' must be 'json_schema' or 'text'" },
      ));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_structured_invalid',
      fallbackStructured: 'unsupported',
      responseFormat: 'unsupported',
      usable: false,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
  });

  it.each([
    ['empty string content', ''],
    ['whitespace-only content', '   '],
  ])('leaves %s unproven for structured fallback', async (_label, content) => {
    proxyManager.fetch.mockResolvedValueOnce(jsonResponse(true, 200, completionBody(content), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'completion_failed',
      fallbackStructured: 'unknown',
      usable: false,
    });
    expect(proxyManager.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['single-quoted JSON healed by the parser', "{'probe': 'ok'}"],
    ['prose-embedded JSON extracted by the parser', 'Here is your result: {"probe":"ok"} done'],
    ['JSON-encoded string healed by the parser', '"{\\"probe\\": \\"ok\\"}"'],
  ])('accepts parser-healed %s as fallback completion', async (_label, content) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(content), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      usable: true,
      responseFormat: 'supported',
      fallbackStructured: 'supported',
    });
  });

  it('rejects unrecoverable content that the parser itself throws on', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody('{"probe": }'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(false, 500, { error: { message: 'Server busy' } }, 'Server Error'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_structured_invalid',
      fallbackStructured: 'unsupported',
      responseFormat: 'unknown',
      usable: false,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it.each([
    ['exact JSON', '{"probe":"ok"}'],
    ['whitespace-padded JSON', '  {"probe" : "ok"}  \n'],
    ['single Markdown JSON fence', '```json\n{"probe":"ok"}\n```'],
    ['plain Markdown fence', '```\n{"probe":"ok"}\n```'],
  ])('accepts %s as fallback completion', async (_label, content) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(content), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      usable: true,
      responseFormat: 'supported',
      fallbackStructured: 'supported',
    });
  });

  it('marks supported on Probe B 200 and writes the cache', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_success',
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: true,
    });
    expect(JSON.parse(proxyManager.fetch.mock.calls[0][1].body)).not.toHaveProperty('response_format');
    expect(JSON.parse(proxyManager.fetch.mock.calls[1][1].body)).toHaveProperty('response_format');
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
  });

  it('reports matched identity without changing the success message', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(MODEL), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(MODEL), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_success',
      modelStatus: 'matched',
      requestedModel: MODEL,
      effectiveModel: MODEL,
      usable: true,
    });
    // Success paths add no extra network beyond the two probes.
    expect(proxyManager.fetch).toHaveBeenCalledTimes(2);
  });

  it('reports unknown identity when neither envelope names a model', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_success',
      modelStatus: 'unknown',
      requestedModel: MODEL,
      effectiveModel: null,
      usable: true,
    });
  });

  it('reports mismatch with usable warning when the served model differs', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('other-model'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('other-model'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch',
      modelStatus: 'mismatch',
      requestedModel: MODEL,
      effectiveModel: 'other-model',
      responseFormat: 'supported',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
    // Mismatch never alters cache writes or keys: requested key written,
    // effective key untouched.
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
    expect(getCustomResponseFormatSupport(URL, 'other-model')).toBeUndefined();
  });

  it('reports LM-Studio-style mismatch with usable fallback on unsupported protocol', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('gemma-3-1b-it-qat'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(
        false,
        400,
        { error: "'response_format.type' must be 'json_schema' or 'text'" },
      ));

    const report = await probeCustomConnection({
      apiUrl: URL,
      apiModel: 'test-model',
      apiKey: 'k',
    });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch_fallback',
      modelStatus: 'mismatch',
      requestedModel: 'test-model',
      effectiveModel: 'gemma-3-1b-it-qat',
      fallbackStructured: 'supported',
      responseFormat: 'unsupported',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
    expect(getCustomResponseFormatSupport(URL, 'test-model')).toBe('unsupported');
    expect(getCustomResponseFormatSupport(URL, 'gemma-3-1b-it-qat')).toBeUndefined();
  });

  it('lets Probe B supply the model when Probe A is silent', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(MODEL), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      modelStatus: 'matched',
      requestedModel: MODEL,
      effectiveModel: MODEL,
    });
  });

  it('treats A/B model disagreement as mismatch with Probe A primary', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('a-model'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('b-model'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      modelStatus: 'mismatch',
      requestedModel: MODEL,
      effectiveModel: 'a-model',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
  });

  it('reports B as effective when A matches but B evidences the mismatch', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(MODEL), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('other-model'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_model_mismatch',
      modelStatus: 'mismatch',
      requestedModel: MODEL,
      effectiveModel: 'other-model',
      responseFormat: 'supported',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
  });

  it('reports A as effective when the requested model equals B but A differs', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('a-model'), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('b-model'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: 'b-model', apiKey: 'k' });

    expect(report).toMatchObject({
      modelStatus: 'mismatch',
      requestedModel: 'b-model',
      effectiveModel: 'a-model',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
  });

  it('keeps mismatch deterministic preferring A when both differ from requested', async () => {
    const first = await (async () => {
      proxyManager.fetch
        .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('a-model'), 'OK'))
        .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('b-model'), 'OK'));
      return probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });
    })();
    const second = await (async () => {
      proxyManager.fetch
        .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('a-model'), 'OK'))
        .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('b-model'), 'OK'));
      return probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });
    })();

    for (const report of [first, second]) {
      expect(report).toMatchObject({
        modelStatus: 'mismatch',
        requestedModel: MODEL,
        effectiveModel: 'a-model',
      });
      expect(report.requestedModel).not.toBe(report.effectiveModel);
    }
  });

  it('reports mismatch from Probe B alone when Probe A is silent', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody('other-model'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      modelStatus: 'mismatch',
      requestedModel: MODEL,
      effectiveModel: 'other-model',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
  });

  it.each([
    ['surrounding whitespace matches', `  ${MODEL}  `, 'matched'],
    ['case differences mismatch', MODEL.toUpperCase(), 'mismatch'],
  ])('normalizes served names conservatively: %s', async (_label, served, status) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(served), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(served), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({ modelStatus: status });
  });

  it('keeps long names distinguishable when only their suffixes differ', async () => {
    const prefix = 'm'.repeat(80);
    const requested = `${prefix}-alpha`;
    const served = `${prefix}-beta`;
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(served), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, modelBody(served), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: requested, apiKey: 'k' });

    // Full names differ past the 80-char bound: prefix-only slices would
    // collide, so head+tail displays must retain the suffix evidence.
    expect(report).toMatchObject({
      modelStatus: 'mismatch',
      responseFormat: 'supported',
      usable: true,
    });
    expect(report.requestedModel).not.toBe(report.effectiveModel);
    expect(report.requestedModel.length).toBeLessThanOrEqual(80);
    expect(report.effectiveModel.length).toBeLessThanOrEqual(80);
    expect(report.requestedModel).toContain('alpha');
    expect(report.effectiveModel).toContain('beta');
    // Matching and cache keys still use the full configured names.
    expect(getCustomResponseFormatSupport(URL, requested)).toBe('supported');
  });

  it('carries the requested model on pre-probe failures without effective evidence', async () => {
    proxyManager.fetch.mockRejectedValueOnce(new TypeError('NetworkError: Failed to fetch'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'unreachable',
      modelStatus: 'unknown',
      requestedModel: MODEL,
      effectiveModel: null,
    });
  });

  it('marks unsupported for LM Studio string-error rejections with fallback usable', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(
        false,
        400,
        { error: "'response_format.type' must be 'json_schema' or 'text'" },
      ));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_fallback',
      fallbackStructured: 'supported',
      responseFormat: 'unsupported',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
  });

  it('degrades supported Probe B 200 with contract-failing content without changing the cache write', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody('hello world'), 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    // Protocol acceptance still writes supported, but the endpoint is never
    // claimed fully usable when the model fails the structured contract.
    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_structured_invalid',
      fallbackStructured: 'supported',
      responseFormat: 'supported',
      usable: false,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
  });

  it.each([
    ['error envelope', { error: { message: 'Upstream failure' } }],
    ['missing choices', {}],
    ['empty choices', { choices: [] }],
    ['non-string content', { choices: [{ message: { content: 42 } }] }],
  ])('leaves Probe B 200 with %s inconclusive without writing', async (_label, body) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, body, 'OK'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_inconclusive',
      responseFormat: 'unknown',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('leaves unrelated Probe B 400 inconclusive without overwriting', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(false, 400, { error: { message: 'Invalid max_tokens' } }));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_inconclusive',
      responseFormat: 'unknown',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it.each([429, 500])('leaves non-400/422 Probe B status %s inconclusive', async (status) => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(false, status, { error: 'response_format broke' }, 'Error'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_inconclusive',
      responseFormat: 'unknown',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBeUndefined();
  });

  it('retains a prior cache entry when the probe is inconclusive', async () => {
    setCustomResponseFormatSupport(URL, MODEL, 'supported');
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(false, 500, { error: { message: 'Server busy' } }, 'Server Error'));

    const report = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(report).toMatchObject({
      state: 'success',
      messageKey: 'custom_api_connection_inconclusive',
      responseFormat: 'unknown',
      usable: true,
    });
    expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
  });

  it('makes no network calls with missing URL or model', async () => {
    for (const config of [
      { apiUrl: '', apiModel: MODEL, apiKey: 'k' },
      { apiUrl: URL, apiModel: '  ', apiKey: 'k' },
    ]) {
      const report = await probeCustomConnection(config);
      expect(report).toMatchObject({
        state: 'missing_config',
        messageKey: 'api_test_custom_config_missing',
        usable: false,
      });
    }
    expect(proxyManager.fetch).not.toHaveBeenCalled();
  });

  it('exposes no raw server text in semantic failure results', async () => {
    proxyManager.fetch.mockResolvedValueOnce(
      jsonResponse(false, 400, { error: { message: `bad: ${'z'.repeat(5000)}` } }),
    );

    const failed = await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(failed).toMatchObject({
      state: 'request_failed',
      messageKey: 'custom_api_connection_request_failed',
      params: { status: 400 },
      usable: false,
    });
  });

  describe('background handler boundary (shared runtime cache)', () => {
    const probeViaHandler = (config) => handleTestCustomConnection({ data: { config } });

    const callProviderOnce = async () => {
      vi.mocked(getCustomApiUrlAsync).mockResolvedValue(URL);
      vi.mocked(getCustomApiModelAsync).mockResolvedValue(MODEL);
      const provider = new CustomProvider();
      const executeRequest = vi.spyOn(provider, '_executeRequest').mockResolvedValue('translated');
      try {
        await provider._callAI('system', 'source', { expectedFormat: ResponseFormat.JSON_OBJECT });
        return JSON.parse(executeRequest.mock.calls[0][0].fetchOptions.body);
      } finally {
        executeRequest.mockRestore();
      }
    };

    it('updates the background cache on unsupported and the provider omits upfront', async () => {
      proxyManager.fetch
        .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
        .mockResolvedValueOnce(jsonResponse(
          false,
          400,
          { error: "'response_format.type' must be 'json_schema' or 'text'" },
        ));

      const response = await probeViaHandler({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

      expect(response).toMatchObject({ success: true });
      expect(response.data.report).toMatchObject({ responseFormat: 'unsupported', usable: true });
      expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
      expect(await callProviderOnce()).not.toHaveProperty('response_format');
    });

    it('makes a supported entry visible to the background provider', async () => {
      proxyManager.fetch
        .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
        .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

      const response = await probeViaHandler({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

      expect(response.data.report).toMatchObject({ responseFormat: 'supported' });
      expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('supported');
      expect(await callProviderOnce()).toHaveProperty('response_format');
    });

    it('leaves a prior entry untouched on inconclusive handler probes', async () => {
      setCustomResponseFormatSupport(URL, MODEL, 'unsupported');
      proxyManager.fetch
        .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
        .mockResolvedValueOnce(jsonResponse(false, 500, { error: { message: 'Server busy' } }, 'Server Error'));

      const response = await probeViaHandler({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

      expect(response.data.report).toMatchObject({ responseFormat: 'unknown', usable: true });
      expect(getCustomResponseFormatSupport(URL, MODEL)).toBe('unsupported');
      expect(await callProviderOnce()).not.toHaveProperty('response_format');
    });
  });

  describe('probe/parser parity (one parsing policy)', () => {
    const corpus = [
      ['exact JSON', '{"probe":"ok"}'],
      ['whitespace-padded JSON', '  {"probe" : "ok"}  \n'],
      ['single Markdown JSON fence', '```json\n{"probe":"ok"}\n```'],
      ['plain Markdown fence', '```\n{"probe":"ok"}\n```'],
      ['single-quoted JSON', "{'probe': 'ok'}"],
      ['prose-embedded JSON', 'Here is your result: {"probe":"ok"} done'],
      ['trailing prose after JSON', '{"probe":"ok"} trailing prose here'],
      ['JSON-encoded string', '"{\\"probe\\": \\"ok\\"}"'],
      ['truncated JSON repaired by the parser', '{"probe": "ok"'],
      ['plain prose', 'hello world'],
      ['prose containing the words', 'probe failed, not ok'],
      ['wrong probe value', '{"probe":"not ok"}'],
      ['malformed JSON with both words', '{probe: "ok"}'],
      ['unrecoverable malformed JSON', '{"probe": }'],
      ['JSON array', '["probe", "ok"]'],
      ['bare scalar', '"ok"'],
      ['empty string', ''],
      ['repetitive garbage output', 'ab'.repeat(150)],
    ];

    const parserAccepts = (content) => {
      let parsed;
      try {
        parsed = AIResponseParser.cleanAIResponse(content, ResponseFormat.JSON_OBJECT);
      } catch {
        return false;
      }
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.probe === 'ok';
    };

    it.each(corpus)('probe validator agrees with AIResponseParser on %s', (_label, content) => {
      // No pinned expectations here on purpose: the probe must track the
      // parser verdict live, so future parser healing changes cannot drift
      // silently (pinned behaviors live in the flow tests above).
      expect(isValidProbeCompletion(content)).toBe(parserAccepts(content));
    });
  });

  it('touches no history/stats/conversation/queue/coordinator/normal execution paths', async () => {
    proxyManager.fetch
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'))
      .mockResolvedValueOnce(jsonResponse(true, 200, completionBody(), 'OK'));

    await probeCustomConnection({ apiUrl: URL, apiModel: MODEL, apiKey: 'k' });

    expect(statsManager.recordRequest).not.toHaveBeenCalled();
    expect(statsManager.recordError).not.toHaveBeenCalled();
    expect(ApiKeyManager.getKeys).not.toHaveBeenCalled();
    expect(ApiKeyManager.promoteKey).not.toHaveBeenCalled();

    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), './CustomConnectionProbe.js'),
      'utf8',
    );
    const importLines = source.split('\n').filter((line) => line.trim().startsWith('import'));
    expect(importLines.join('\n')).not.toMatch(
      /UnifiedTranslationService|QueueManager|ProviderCoordinator|BaseAIProvider|TranslationStatsManager|AIConversationHelper|ApiKeyManager|StorageCore|RateLimit|Conversation/,
    );
    expect(source).not.toMatch(/(^|[^.\w$])fetch\s*\(/m);
    // Single parsing policy: the shared runtime parser, no probe-local
    // healer rules, no execution context (no diagnostics side effects).
    expect(importLines.join('\n')).toMatch(/AIResponseParser/);
    expect(source).toMatch(/cleanAIResponse\(content, ResponseFormat\.JSON_OBJECT\)/);
    expect(source).not.toMatch(/stripJsonFence/);
    expect(source).not.toMatch(/JSON\.parse\(strip/);
  });
});
