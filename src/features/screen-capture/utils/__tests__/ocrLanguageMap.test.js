import { describe, it, expect } from 'vitest';
import { toTesseractLanguageCode, OCR_LANGUAGE_MAP, getSupportedOCRCanvasCodes, isLanguageSupported } from '../ocrLanguageMap.js';

describe('ocrLanguageMap', () => {
  describe('OCR_LANGUAGE_MAP', () => {
    it('should contain expected language mappings', () => {
      expect(OCR_LANGUAGE_MAP).toBeDefined();
      expect(typeof OCR_LANGUAGE_MAP).toBe('object');
    });

    it('should map common languages correctly', () => {
      expect(OCR_LANGUAGE_MAP.en).toBe('eng');
      expect(OCR_LANGUAGE_MAP.fa).toBe('fas');
      expect(OCR_LANGUAGE_MAP.fr).toBe('fra');
      expect(OCR_LANGUAGE_MAP['zh-cn']).toBe('chi_sim');
    });

    it('should have consistent keys', () => {
      const keys = Object.keys(OCR_LANGUAGE_MAP);
      expect(keys).toContain('en');
      expect(keys).toContain('fa');
      expect(keys).toContain('zh-cn');
      expect(keys).toContain('ja');
    });
  });

  describe('toTesseractLanguageCode', () => {
    it('should map supported languages', () => {
      expect(toTesseractLanguageCode('en')).toBe('eng');
      expect(toTesseractLanguageCode('fa')).toBe('fas');
      expect(toTesseractLanguageCode('fr')).toBe('fra');
      expect(toTesseractLanguageCode('de')).toBe('deu');
    });

    it('should return language code if no mapping exists', () => {
      expect(toTesseractLanguageCode('unknown')).toBe('unknown');
    });

    it('should use default fallback for null/undefined', () => {
      expect(toTesseractLanguageCode(null)).toBe('eng');
      expect(toTesseractLanguageCode(undefined)).toBe('eng');
    });

    it('should use custom fallback', () => {
      expect(toTesseractLanguageCode(null, 'fra')).toBe('fra');
      // For unknown code, it returns the unknown code itself as per implementation
      expect(toTesseractLanguageCode('unknown', 'deu')).toBe('unknown');
    });

    it('should handle special language codes', () => {
      expect(toTesseractLanguageCode('auto')).toBe('eng'); // special case
      expect(toTesseractLanguageCode('detect')).toBe('eng'); // special case
    });
  });

  describe('getSupportedOCRCanvasCodes', () => {
    it('should return array of language codes', () => {
      const codes = getSupportedOCRCanvasCodes();
      expect(Array.isArray(codes)).toBe(true);
      expect(codes.length).toBeGreaterThan(0);
    });

    it('should contain expected languages', () => {
      const codes = getSupportedOCRCanvasCodes();
      expect(codes).toContain('eng');
      expect(codes).toContain('fas');
      expect(codes).toContain('chi_sim');
    });
  });

  describe('isLanguageSupported', () => {
    it('should return true for supported languages', () => {
      expect(isLanguageSupported('en')).toBe(true);
      expect(isLanguageSupported('fa')).toBe(true);
      expect(isLanguageSupported('fr')).toBe(true);
    });

    it('should return false for unsupported languages', () => {
      expect(isLanguageSupported('unknown')).toBe(false);
      expect(isLanguageSupported('xyz')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isLanguageSupported(null)).toBe(false);
      expect(isLanguageSupported(undefined)).toBe(false);
    });
  });
});
