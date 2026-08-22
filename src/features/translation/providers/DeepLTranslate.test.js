import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeepLTranslateProvider } from './DeepLTranslate.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('webextension-polyfill', () => ({ default: { storage: { local: { get: vi.fn(), set: vi.fn() } } } }));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ init: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })
}));

describe('DeepLTranslateProvider response contract', () => {
  let provider;

  beforeEach(() => {
    provider = new DeepLTranslateProvider();
    vi.spyOn(provider, '_getConfig').mockResolvedValue({ apiKey: 'key', apiUrl: 'https://api.deepl.test' });
  });

  const translate = async (response, texts = ['source'], options = {}) => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => options.extractResponse(response));
    return provider._translateChunk(texts, 'en', 'fa', 'selection', null, 0, texts.length, 0, 1, options);
  };

  it('accepts valid source-equal output', async () => {
    await expect(translate({ translations: [{ text: 'URL' }] }, ['URL'])).resolves.toEqual(['URL']);
  });

  it('returns ordered valid multi-item translations with blank input preserved', async () => {
    await expect(translate({ translations: [{ text: 'one translated' }, { text: 'two translated' }] }, ['one', ' ', 'two']))
      .resolves.toEqual(['one translated', '', 'two translated']);
  });

  it('writes one detected source when all reported sources agree', async () => {
    const options = { providerMetadataRef: { metadata: {} } };

    await translate({
      translations: [
        { text: 'one translated', detected_source_language: 'EN' },
        { text: 'two translated', detected_source_language: 'en' },
      ],
    }, ['one', 'two'], options);

    expect(options.providerMetadataRef.metadata.detectedLanguage).toBe('en');
    expect(provider).not.toHaveProperty('lastDetectedLanguage');
  });

  it('does not publish conflicting or missing detected sources', async () => {
    const conflictingOptions = { providerMetadataRef: { metadata: {} } };
    await translate({
      translations: [
        { text: 'one translated', detected_source_language: 'en' },
        { text: 'two translated', detected_source_language: 'de' },
      ],
    }, ['one', 'two'], conflictingOptions);
    expect(conflictingOptions.providerMetadataRef.metadata).toEqual({});

    const missingOptions = { providerMetadataRef: { metadata: {} } };
    await translate({ translations: [{ text: 'translated' }] }, ['source'], missingOptions);
    expect(missingOptions.providerMetadataRef.metadata).toEqual({});
  });

  it.each([
    ['missing translations', {}],
    ['blank item', { translations: [{ text: '  ' }] }],
    ['wrong cardinality', { translations: [{ text: 'one' }] }],
  ])('throws API_RESPONSE_INVALID for %s', async (_label, response) => {
    const options = { providerMetadataRef: { metadata: {} } };
    await expect(translate(response, ['one', 'two'], options)).rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
    expect(options.providerMetadataRef.metadata).toEqual({});
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty array', []],
  ])('rejects unexpected final %s result with API_RESPONSE_INVALID', async (_label, response) => {
    vi.spyOn(provider, '_executeRequest').mockResolvedValue(response);

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });

  it.each([
    [ErrorTypes.NETWORK_ERROR],
    [ErrorTypes.USER_CANCELLED],
    [ErrorTypes.TRANSLATION_TIMEOUT],
  ])('preserves %s failures from transport', async (type) => {
    const error = Object.assign(new Error(type), { type });
    vi.spyOn(provider, '_executeRequest').mockRejectedValue(error);

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type });
  });

  it('rejects the parent when a recursive HTTP-400 split child fails', async () => {
    const http400 = new Error('HTTP 400');
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      calls++;
      if (calls === 1 || calls === 3) throw http400;
      return options.extractResponse({ translations: [{ text: 'first translated' }] });
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 0, 2, 0, 1, {}))
      .rejects.toThrow('HTTP 400');
    expect(calls).toBe(3);
  });

  it('rejects the parent when a sequential fallback item fails', async () => {
    const http400 = new Error('HTTP 400');
    const network = Object.assign(new Error('network failed'), { type: ErrorTypes.NETWORK_ERROR });
    let calls = 0;
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      calls++;
      if (calls === 1) throw http400;
      if (calls === 2) return options.extractResponse({ translations: [{ text: 'first translated' }] });
      throw network;
    });

    await expect(provider._translateChunk(['first', 'second'], 'en', 'fa', 'selection', null, 3, 2, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.NETWORK_ERROR });
    expect(calls).toBe(3);
  });

  it('accepts a response that preserves prepared XML placeholders', async () => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => {
      expect(options.fetchOptions.body.getAll('text')).toEqual(['before <x id="SUB_TOKEN" /> after']);
      return options.extractResponse({ translations: [{ text: 'translated <x id="SUB_TOKEN" /> text' }] });
    });

    await expect(provider._translateChunk(['before @@SUB_TOKEN@@ after'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .resolves.toEqual(['translated @@SUB_TOKEN@@text']);
  });

  it('rejects XML placeholder corruption without returning source text', async () => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) =>
      options.extractResponse({ translations: [{ text: 'translated text without placeholder' }] })
    );

    await expect(provider._translateChunk(['before @@SUB_TOKEN@@ after'], 'en', 'fa', 'selection', null, 0, 1, 0, 1, {}))
      .rejects.toMatchObject({ type: ErrorTypes.API_RESPONSE_INVALID });
  });
});
