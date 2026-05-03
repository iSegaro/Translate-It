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
    Dictionary_Translation: 'dictionary'
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
        'سلام دنیا', AUTO_DETECT_VALUE, 'fa', 'en', 'fa', { mode: 'selection' }
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
        'Hello World', AUTO_DETECT_VALUE, 'fa', 'en', 'fa', { mode: 'selection' }
      );

      // Expected: Keep Auto -> Farsi
      expect(src).toBe(AUTO_DETECT_VALUE);
      expect(tgt).toBe('fa');
    });

    it('should NOT swap when source is NOT auto (explicit choice)', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      
      // Setup: Text is Farsi, Target is Farsi, BUT Source is explicitly English
      LanguageDetectionService.detect.mockResolvedValue('fa');

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'en', 'fa', 'en', 'fa', { mode: 'selection' }
      );

      // Expected: Keep English -> Farsi (respect user choice)
      expect(src).toBe('en');
      expect(tgt).toBe('fa');
    });

    it('should NOT swap when bilingual feature is disabled', async () => {
      const { getBilingualTranslationEnabledAsync } = await import("@/shared/config/config.js");
      getBilingualTranslationEnabledAsync.mockResolvedValue(false);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', AUTO_DETECT_VALUE, 'fa', 'en', 'fa', { mode: 'selection' }
      );

      expect(src).toBe(AUTO_DETECT_VALUE);
      expect(tgt).toBe('fa');
    });

    it('should fallback to English if originalSourceLang is auto and swap occurs', async () => {
      const { LanguageDetectionService } = await import("@/shared/services/LanguageDetectionService.js");
      const { getCanonicalCode } = await import("@/shared/config/languageConstants.js");
      const { getBilingualTranslationEnabledAsync } = await import("@/shared/config/config.js");
      
      // Ensure bilingual is enabled for this specific test
      getBilingualTranslationEnabledAsync.mockResolvedValue(true);
      LanguageDetectionService.detect.mockResolvedValue('fa');
      getCanonicalCode.mockImplementation(l => l);

      const [src, tgt] = await LanguageSwappingService.applyLanguageSwapping(
        'سلام', 'auto', 'fa', 'auto', 'fa', { mode: 'selection' }
      );

      expect(src).toBe('fa');
      expect(tgt).toBe('en');
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
