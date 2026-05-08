import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LanguageDetectionService } from './LanguageDetectionService.js';
import * as textAnalysis from "@/shared/utils/text/textAnalysis.js";

// Mock textAnalysis
vi.mock("@/shared/utils/text/textAnalysis.js", async () => {
  const actual = await vi.importActual("@/shared/utils/text/textAnalysis.js");
  return {
    ...actual,
    shouldApplyRtl: vi.fn()
  };
});

describe('LanguageDetectionService - Direction Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRTL', () => {
    it('should identify RTL language codes', () => {
      expect(LanguageDetectionService.isRTL('fa')).toBe(true);
      expect(LanguageDetectionService.isRTL('ar')).toBe(true);
      expect(LanguageDetectionService.isRTL('he')).toBe(true);
    });

    it('should identify RTL language names', () => {
      expect(LanguageDetectionService.isRTL('Persian')).toBe(true);
      expect(LanguageDetectionService.isRTL('Arabic')).toBe(true);
    });

    it('should identify LTR language codes', () => {
      expect(LanguageDetectionService.isRTL('en')).toBe(false);
      expect(LanguageDetectionService.isRTL('ja')).toBe(false);
    });
  });

  describe('getDirection', () => {
    it('should prioritize explicit langCode', () => {
      // Even if text is English, if langCode is 'fa', result should be 'rtl'
      expect(LanguageDetectionService.getDirection('Hello', 'fa')).toBe('rtl');
    });

    it('should fall back to content analysis if langCode is missing or auto', () => {
      vi.mocked(textAnalysis.shouldApplyRtl).mockReturnValue(true);
      expect(LanguageDetectionService.getDirection('سلام', 'auto')).toBe('rtl');
      
      vi.mocked(textAnalysis.shouldApplyRtl).mockReturnValue(false);
      expect(LanguageDetectionService.getDirection('Hello', null)).toBe('ltr');
    });

    it('should default to ltr if no info available', () => {
      expect(LanguageDetectionService.getDirection(null, null)).toBe('ltr');
    });
  });
});
