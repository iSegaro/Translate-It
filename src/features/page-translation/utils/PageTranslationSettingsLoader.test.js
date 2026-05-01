import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageTranslationSettingsLoader } from './PageTranslationSettingsLoader.js';
import { TranslationMode, CONFIG } from '@/config.js';

// Mock config functions
vi.mock('@/config.js', () => ({
  getWholePageLazyLoadingAsync: vi.fn(),
  getWholePageAutoTranslateOnDOMChangesAsync: vi.fn(),
  getWholePageRootMarginAsync: vi.fn(),
  getWholePageExcludedSelectorsAsync: vi.fn(),
  getWholePageAttributesToTranslateAsync: vi.fn(),
  getWholePageShowOriginalOnHoverAsync: vi.fn(),
  getWholePageTranslateAfterScrollStopAsync: vi.fn(),
  getWholePageScrollStopDelayAsync: vi.fn(),
  getTranslationApiAsync: vi.fn(),
  getTargetLanguageAsync: vi.fn(),
  getModeProvidersAsync: vi.fn(),
  getAIContextTranslationEnabledAsync: vi.fn(),
  TranslationMode: { Page: 'page' },
  CONFIG: {
    WHOLE_PAGE_CHUNK_SIZE: 100,
    WHOLE_PAGE_MAX_CONCURRENT_REQUESTS: 3
  }
}));

vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    debugLazy: vi.fn()
  }))
}));

import * as config from '@/config.js';

describe('PageTranslationSettingsLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mock returns
    config.getWholePageRootMarginAsync.mockResolvedValue(150);
    config.getModeProvidersAsync.mockResolvedValue({});
    config.getTranslationApiAsync.mockResolvedValue('google');
    config.getTargetLanguageAsync.mockResolvedValue('fa');
    config.getWholePageLazyLoadingAsync.mockResolvedValue(true);
    config.getWholePageAutoTranslateOnDOMChangesAsync.mockResolvedValue(true);
    config.getWholePageExcludedSelectorsAsync.mockResolvedValue(['.ignore']);
    config.getWholePageAttributesToTranslateAsync.mockResolvedValue(['title']);
    config.getWholePageShowOriginalOnHoverAsync.mockResolvedValue(true);
    config.getWholePageTranslateAfterScrollStopAsync.mockResolvedValue(true);
    config.getWholePageScrollStopDelayAsync.mockResolvedValue(500);
    config.getAIContextTranslationEnabledAsync.mockResolvedValue(true);
  });

  it('should load settings with correct formatting', async () => {
    const settings = await PageTranslationSettingsLoader.load();

    expect(settings).toEqual({
      translationApi: 'google',
      targetLanguage: 'fa',
      lazyLoading: true,
      rootMargin: '150px',
      autoTranslateOnDOMChanges: true,
      excludedSelectors: ['.ignore'],
      attributesToTranslate: ['title'],
      showOriginalOnHover: true,
      translateAfterScrollStop: true,
      scrollStopDelay: 500,
      aiContextTranslationEnabled: true,
      chunkSize: 100,
      maxConcurrentFlushes: 3
    });
  });

  it('should handle rootMargin with units', async () => {
    config.getWholePageRootMarginAsync.mockResolvedValue('20%');
    const settings = await PageTranslationSettingsLoader.load();
    expect(settings.rootMargin).toBe('20%');
  });

  it('should prioritize options over stored settings', async () => {
    const settings = await PageTranslationSettingsLoader.load({
      provider: 'gemini',
      targetLanguage: 'en'
    });

    expect(settings.translationApi).toBe('gemini');
    expect(settings.targetLanguage).toBe('en');
  });

  it('should resolve provider priority: Options > Mode Provider > Global Provider', async () => {
    // Mode specific exists
    config.getModeProvidersAsync.mockResolvedValue({ [TranslationMode.Page]: 'openai' });
    config.getTranslationApiAsync.mockResolvedValue('google');

    let settings = await PageTranslationSettingsLoader.load();
    expect(settings.translationApi).toBe('openai');

    // Option overrides mode specific
    settings = await PageTranslationSettingsLoader.load({ provider: 'gemini' });
    expect(settings.translationApi).toBe('gemini');

    // If mode specific doesn't exist, use global
    config.getModeProvidersAsync.mockResolvedValue({});
    settings = await PageTranslationSettingsLoader.load();
    expect(settings.translationApi).toBe('google');
  });

  it('should use default values for missing settings', async () => {
    config.getWholePageRootMarginAsync.mockResolvedValue(null);
    config.getWholePageScrollStopDelayAsync.mockResolvedValue(undefined);
    
    const settings = await PageTranslationSettingsLoader.load();
    
    expect(settings.rootMargin).toBe('150px');
    expect(settings.scrollStopDelay).toBe(500);
  });
});
