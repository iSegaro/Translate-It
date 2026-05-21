import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LanguageSwappingService } from './LanguageSwappingService.js';
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";

// Mock dependencies
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock("@/shared/services/LanguageDetectionService.js", () => ({
  LanguageDetectionService: {
    detect: vi.fn()
  }
}));

vi.mock("@/shared/config/config.js", () => ({
  getBilingualTranslationEnabledAsync: vi.fn(() => Promise.resolve(true)),
  getBilingualTranslationModesAsync: vi.fn(() => Promise.resolve({ selection: true, popup: true })),
  TranslationMode: {
    Dictionary_Translation: 'dictionary',
    Field: 'content',
    Selection: 'selection',
    Popup_Translate: 'popup'
  }
}));

vi.mock("@/shared/config/languageConstants.js", () => ({
  LANGUAGE_NAME_TO_CODE_MAP: { 
    'english': 'en', 
    'farsi': 'fa',
    'en': 'en',
    'fa': 'fa'
  },
  getCanonicalCode: vi.fn(lang => lang)
}));

describe('LanguageSwappingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyLanguageSwapping', () => {
    it('should swap languages when detected matches target and source is auto', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      const { getCanonicalCode } = await import("@/shared/config/languageConstants.js");

      // Setup: Text is Farsi, Target is Farsi, Source is Auto
      LanguageDetectionService.detect.mockResolvedValue('fa');
      getCanonicalCode.mockImplementation(l => l === 'fa' ? 'fa' : l);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام دنیا', AUTO_DETECT_VALUE, 'fa', 'en', { mode: 'selection' }
      );

      // Expected: Swap to Farsi -> English
      expect(src).toBe('fa');
      expect(tgt).toBe('en');
    });

    it('should NOT swap when detected does NOT match target', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      
      // Setup: Text is English, Target is Farsi, Source is Auto
      LanguageDetectionService.detect.mockResolvedValue('en');

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'Hello World', AUTO_DETECT_VALUE, 'fa', 'en', { mode: 'selection' }
      );

      // Expected: Keep Auto -> Farsi
      expect(src).toBe(AUTO_DETECT_VALUE);
      expect(tgt).toBe('fa');
    });

    it('should swap when source is NOT auto if bilingual mode is active', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      const { getCanonicalCode } = await import("@/shared/config/languageConstants.js");
      
      // Setup: Text is Farsi, Target is Farsi, BUT Source is explicitly English
      LanguageDetectionService.detect.mockResolvedValue('fa');
      getCanonicalCode.mockImplementation(l => l);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'en', 'fa', 'en', { mode: 'selection' }
      );

      // Expected: SWAP to Farsi -> English even if source was explicit
      expect(src).toBe('fa');
      expect(tgt).toBe('en');
    });

    it('should handle legacy "field" mode key for backward compatibility', async () => {
      const { getBilingualTranslationModesAsync } = await import("@/shared/config/config.js");
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      
      // Setup: BILINGUAL_TRANSLATION_MODES only contains 'field' (legacy) but NOT 'content' (new)
      getBilingualTranslationModesAsync.mockResolvedValue({ 'field': true });
      LanguageDetectionService.detect.mockResolvedValue('fa');

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'auto', 'fa', 'en', { mode: 'content' } // TranslationMode.Field is 'content'
      );

      // Expected: Should still swap because it falls back to 'field' key
      expect(src).toBe('fa');
      expect(tgt).toBe('en');
    });

    it('should NOT swap when bilingual feature is disabled', async () => {
      const { getBilingualTranslationEnabledAsync } = await import("@/shared/config/config.js");
      getBilingualTranslationEnabledAsync.mockResolvedValue(false);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', AUTO_DETECT_VALUE, 'fa', 'en', { mode: 'selection' }
      );

      expect(src).toBe(AUTO_DETECT_VALUE);
      expect(tgt).toBe('fa');
    });

    it('should fallback to English if originalSourceLang is auto and swap occurs', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      const { getCanonicalCode } = await import("@/shared/config/languageConstants.js");
      const { getBilingualTranslationEnabledAsync, getBilingualTranslationModesAsync } = await import("@/shared/config/config.js");
      
      // Setup
      getBilingualTranslationEnabledAsync.mockResolvedValue(true);
      getBilingualTranslationModesAsync.mockResolvedValue({ selection: true });
      LanguageDetectionService.detect.mockResolvedValue('fa');
      getCanonicalCode.mockImplementation(l => l);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'auto', 'fa', 'auto', { mode: 'selection' }
      );

      expect(src).toBe('fa');
      expect(tgt).toBe('en');
    });

    it('should swap to Farsi when detected text is English and target is English', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      const { getCanonicalCode } = await import("@/shared/config/languageConstants.js");
      
      LanguageDetectionService.detect.mockResolvedValue('en');
      getCanonicalCode.mockImplementation(l => l);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'Hello', 'auto', 'en', 'auto', { mode: 'selection' }
      );

      // Expected: en -> fa (Smart fallback to Farsi for English input)
      expect(src).toBe('en');
      expect(tgt).toBe('fa');
    });

    it('should respect user manual source language as the new target after swapping', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      
      // Setup: User set Source=German (de), Target=Farsi (fa). 
      // User types Farsi -> System should swap to Farsi -> German.
      LanguageDetectionService.detect.mockResolvedValue('fa');

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'de', 'fa', 'de', { mode: 'selection' }
      );

      expect(src).toBe('fa');
      expect(tgt).toBe('de'); // Should use 'de' instead of default 'en'
    });

    it('should ALWAYS swap in Dictionary mode if detected matches target, even if bilingual is disabled for that mode', async () => {
      const { getBilingualTranslationModesAsync } = await import("@/shared/config/config.js");
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      
      // Setup: Bilingual is DISABLED for dictionary mode in settings
      getBilingualTranslationModesAsync.mockResolvedValue({ 'dictionary': false });
      LanguageDetectionService.detect.mockResolvedValue('en');

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'book', 'auto', 'en', 'en', { mode: 'dictionary' }
      );

      // Expected: Still swaps because Dictionary mode requires it to get definitions
      expect(src).toBe('en');
      expect(tgt).toBe('fa');
    });

    it('should return original languages if detection fails', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      LanguageDetectionService.detect.mockRejectedValue(new Error('Detection Error'));

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'test', AUTO_DETECT_VALUE, 'fa', 'en'
      );

      expect(src).toBe(AUTO_DETECT_VALUE);
      expect(tgt).toBe('fa');
    });
  });

  describe('_normalizeLangValue', () => {
    it('should normalize auto-detect aliases', () => {
      expect(LanguageSwappingService._normalizeLangValue('Auto-Detect')).toBe(AUTO_DETECT_VALUE);
      expect(LanguageSwappingService._normalizeLangValue('detect')).toBe(AUTO_DETECT_VALUE);
    });

    it('should map language names to codes', () => {
      expect(LanguageSwappingService._normalizeLangValue('English')).toBe('en');
      expect(LanguageSwappingService._normalizeLangValue('Farsi')).toBe('fa');
    });
  });
});
