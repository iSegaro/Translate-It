import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VajehyabProvider } from './VajehyabProvider.js';
import { ProviderNames } from '@/features/translation/providers/ProviderConstants.js';

// Mock dependencies
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
    performance: vi.fn(),
  }),
}));

vi.mock('@/shared/config/config.js', () => ({
  getSettingsAsync: vi.fn(() => Promise.resolve({})),
  getProviderOptimizationLevelAsync: vi.fn(() => Promise.resolve('balanced')),
  getEffectiveProviderAsync: vi.fn(() => Promise.resolve('google')),
  getApplication_LocalizeAsync: vi.fn(() => Promise.resolve('fa')),
  TranslationMode: {
    General: 'general',
    Page: 'page',
    Select_Element: 'select_element'
  }
}));

vi.mock('@/shared/proxy/ProxyManager.js', () => ({
  proxyManager: {
    setConfig: vi.fn(),
  }
}));

describe('VajehyabProvider', () => {
  let provider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new VajehyabProvider();
    
    // Mock _executeApiCall to simulate fetch
    vi.spyOn(provider, '_executeApiCall').mockResolvedValue({
      hit: {
        title: 'سلام',
        kind: 'اسم',
        pronunciation: 'salām',
        description: 'درود، تحیت',
        dictionarySlug: 'amid'
      }
    });
  });

  it('should initialize with correct name and capabilities', () => {
    expect(provider.providerName).toBe(ProviderNames.VAJEHYAB);
    expect(VajehyabProvider.supportsDictionary).toBe(true);
    expect(VajehyabProvider.supportsTranslation).toBe(true);
  });

  describe('_getLangCode', () => {
    it('should preserve auto and empty as auto-detect', () => {
      expect(provider._getLangCode('auto')).toBe('auto');
      expect(provider._getLangCode(null)).toBe('auto');
    });

    it('should return correct codes for supported languages', () => {
      expect(provider._getLangCode('en')).toBe('en');
      expect(provider._getLangCode('ar')).toBe('ar');
      expect(provider._getLangCode('tr')).toBe('tr');
    });
  });

  describe('_batchTranslate', () => {
    it('should look up only the first word', async () => {
      await provider._batchTranslate(['سلام دنیا'], 'en', 'fa');
      
      expect(provider._executeApiCall).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('q=%D8%B3%D9%84%D8%A7%D9%85'), // URL encoded 'سلام'
        })
      );
    });

    it('should return formatted result on success without fabricating auto detection feedback', async () => {
      const result = await provider._batchTranslate(['سلام'], 'auto', 'fa');

      expect(result[0]).toContain('سلام');
      expect(result[0]).toContain('لغت‌نامه عمید');
      expect(provider.lastDetectedLanguage).toBeNull();
    });

    it('should return fallback message when word is not found', async () => {
      vi.spyOn(provider, '_executeApiCall').mockResolvedValue({ hit: {} });
      
      const result = await provider._batchTranslate(['unknownword'], 'en', 'fa');
      
      expect(result[0]).toContain('Word not found');
    });

    it('should return original texts if target word is empty', async () => {
      const input = ['   '];
      const result = await provider._batchTranslate(input, 'en', 'fa');
      expect(result).toBe(input);
      expect(provider._executeApiCall).not.toHaveBeenCalled();
    });

    it('should propagate API errors', async () => {
      vi.spyOn(provider, '_executeApiCall').mockRejectedValue(new Error('API Failure'));
      
      await expect(provider._batchTranslate(['word'], 'en', 'fa')).rejects.toThrow('API Failure');
    });
  });

  describe('_formatDictionaryResponse', () => {
    it('should decode HTML entities in pronunciation', () => {
      const hit = {
        title: 'test',
        pronunciation: 'test&#39;s &amp; &quot;test&quot;',
        description: 'desc',
        dictionarySlug: 'moein'
      };
      
      const result = provider._formatDictionaryResponse(hit);
      expect(result).toContain("[test's & \"test\"]");
    });

    it('should map slugs to friendly names', () => {
      const hit = {
        title: 'سلام',
        description: 'معنی',
        dictionarySlug: 'dehkhoda'
      };
      
      const result = provider._formatDictionaryResponse(hit);
      expect(result).toContain('لغت‌نامه دهخدا');
    });

    it('should clean up HTML tags in description', () => {
      const hit = {
        title: 'word',
        description: '<p>Line 1<br>Line 2</p><div>Line 3</div>',
        dictionarySlug: 'wiki'
      };
      
      const result = provider._formatDictionaryResponse(hit);
      expect(result).toContain('Line 1 Line 2 Line 3');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<div>');
    });

    it('should handle missing fields gracefully', () => {
      const hit = {
        title: 'simple'
        // missing other fields
      };
      
      const result = provider._formatDictionaryResponse(hit);
      expect(result).toContain('### simple');
      expect(result).toContain('واژه‌یاب'); // Fallback name
    });

    it('should format as Markdown', () => {
      const hit = {
        title: 'Word',
        kind: 'Noun',
        pronunciation: 'word',
        description: 'A unit of language',
        dictionarySlug: 'moein'
      };
      
      const result = provider._formatDictionaryResponse(hit);
      expect(result).toBe('### Word [word]\n*Noun*\n\n---\n\n**معنی (فرهنگ معین)**:\nA unit of language');
    });
  });
});
