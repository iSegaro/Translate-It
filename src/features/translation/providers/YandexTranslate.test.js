import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { YandexTranslateProvider } from './YandexTranslate.js';

vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
    storage: { local: { get: vi.fn(), set: vi.fn() } }
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    init: vi.fn(),
    operation: vi.fn(),
    performance: vi.fn()
  })
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
  getYandexTranslateUrlAsync: vi.fn(() => Promise.resolve('https://translate.yandex.net/api/v1/tr.json/translate'))
}));

describe('YandexTranslateProvider output contract', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new YandexTranslateProvider();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const runResponse = (sources, translations, lang = 'en-fa') => {
    vi.spyOn(provider, '_executeRequest').mockImplementation(async (options) => options.extractResponse({
      code: 200,
      text: translations,
      lang
    }));

    return provider._translateChunk(sources, 'en', 'fa', 'selection', null, 0, sources.length, 0, 1);
  };

  it.each(['', '   ', '\n\t', null, undefined])('rejects unusable output for nonblank source: %j', async (translatedItem) => {
    await expect(runResponse(['A'], [translatedItem]))
      .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
  });

  it.each(['', '   '])('rejects invalid middle output: %j', async (translatedItem) => {
    await expect(runResponse(['A', 'B', 'C'], ['A2', translatedItem, 'C2']))
      .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
  });

  it('rejects shorter response arrays', async () => {
    await expect(runResponse(['A', 'B', 'C'], ['A2', 'B2']))
      .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });
  });

  it.each(['', '   '])('preserves blank source slots: %j', async (blankSource) => {
    const sources = [blankSource, 'A'];
    await expect(runResponse(sources, [sources[0], 'A2'])).resolves.toEqual([sources[0], 'A2']);
  });

  it('accepts identity translation', async () => {
    await expect(runResponse(['URL'], ['URL'])).resolves.toEqual(['URL']);
  });

  it('preserves detected language for valid output', async () => {
    await runResponse(['A'], ['A2'], 'en-fa');

    expect(provider.lastDetectedLanguage).toBe('en');
  });

  it('does not update detected language for invalid output', async () => {
    provider.lastDetectedLanguage = 'fr';

    await expect(runResponse(['A'], [''], 'en-fa'))
      .rejects.toMatchObject({ type: 'API_RESPONSE_INVALID' });

    expect(provider.lastDetectedLanguage).toBe('fr');
  });
});
