import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { browserTranslateProvider } from './BrowserAPI.js';
import { ErrorTypes } from '@/shared/error-management/ErrorTypes.js';

vi.mock('webextension-polyfill', () => ({ default: { i18n: { detectLanguage: vi.fn() } } }));
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), init: vi.fn() })
}));

describe('browserTranslateProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new browserTranslateProvider();
    browserTranslateProvider.detector = null;
    browserTranslateProvider.translators = {};
    globalThis.LanguageDetector = {};
  });

  afterEach(() => {
    delete globalThis.Translator;
    delete globalThis.LanguageDetector;
  });

  const installTranslator = (translate) => {
    globalThis.Translator = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({ translate })
    };
  };

  it('accepts valid output equal to source', async () => {
    installTranslator(vi.fn().mockResolvedValue('URL'));

    await expect(provider._translateChunk(['URL'], 'en', 'fa', 'selection')).resolves.toEqual(['URL']);
  });

  it.each([
    ['native exception', vi.fn().mockRejectedValue(new Error('native failed')), ErrorTypes.API_ERROR],
    ['missing output', vi.fn().mockResolvedValue(undefined), ErrorTypes.API_RESPONSE_INVALID],
    ['blank output', vi.fn().mockResolvedValue('  '), ErrorTypes.API_RESPONSE_INVALID],
  ])('throws %s instead of returning source text', async (_label, translate, type) => {
    installTranslator(translate);

    await expect(provider._translateChunk(['source'], 'en', 'fa', 'selection')).rejects.toMatchObject({ type });
  });

  it('rejects whole chunk when a later segment fails', async () => {
    installTranslator(vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(new Error('second failed')));

    await expect(provider._translateChunk(['one', 'two'], 'en', 'fa', 'selection')).rejects.toMatchObject({ type: ErrorTypes.API_ERROR });
  });

  it('resetSessionContext destroys detector and all cached translators', () => {
    const detector = { destroy: vi.fn() };
    const firstTranslator = { destroy: vi.fn() };
    const secondTranslator = { destroy: vi.fn() };
    browserTranslateProvider.detector = detector;
    browserTranslateProvider.translators = {
      'en-fa': firstTranslator,
      'de-en': secondTranslator,
    };

    provider.resetSessionContext();

    expect(detector.destroy).toHaveBeenCalledOnce();
    expect(firstTranslator.destroy).toHaveBeenCalledOnce();
    expect(secondTranslator.destroy).toHaveBeenCalledOnce();
    expect(browserTranslateProvider.detector).toBeNull();
    expect(browserTranslateProvider.translators).toEqual({});
  });
});
