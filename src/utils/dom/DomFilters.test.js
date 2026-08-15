import { describe, it, expect } from 'vitest';
import { DOM_FILTERS } from './DomFilters.js';

describe('DOM_FILTERS', () => {
  describe('isFormattingOnly', () => {
    it('should exclude a lone U+200B zero-width space', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u200B')).toBe(true);
    });

    it('should exclude a lone U+200E left-to-right mark', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u200E')).toBe(true);
    });

    it('should exclude a lone U+200F right-to-left mark', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u200F')).toBe(true);
    });

    it('should exclude a lone U+2060 word joiner', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u2060')).toBe(true);
    });

    it('should exclude a lone U+FEFF zero-width no-break space', () => {
      expect(DOM_FILTERS.isFormattingOnly('\uFEFF')).toBe(true);
    });

    it('should exclude combinations of formatting marks', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u200B\u200F')).toBe(true);
      expect(DOM_FILTERS.isFormattingOnly('\u200E\u200B\u2060\uFEFF')).toBe(true);
    });

    it('should exclude formatting marks surrounded by whitespace', () => {
      expect(DOM_FILTERS.isFormattingOnly(' \u200E ')).toBe(true);
      expect(DOM_FILTERS.isFormattingOnly('\t\u200F\n')).toBe(true);
    });

    it('should accept meaningful text containing a trailing U+200E', () => {
      expect(DOM_FILTERS.isFormattingOnly('Hello\u200E')).toBe(false);
    });

    it('should accept meaningful text preceded by U+200E', () => {
      expect(DOM_FILTERS.isFormattingOnly('\u200EHello')).toBe(false);
    });

    it('should accept Persian text containing U+200F', () => {
      expect(DOM_FILTERS.isFormattingOnly('سلام\u200F')).toBe(false);
    });

    it('should accept normal RTL text unchanged', () => {
      expect(DOM_FILTERS.isFormattingOnly('سلام دنیا')).toBe(false);
      expect(DOM_FILTERS.isFormattingOnly('مرحبا')).toBe(false);
    });

    it('should leave single visible characters subject to existing rules only', () => {
      // Not a formatting mark, so not excluded here (other filters decide)
      expect(DOM_FILTERS.isFormattingOnly('A')).toBe(false);
      expect(DOM_FILTERS.isFormattingOnly('1')).toBe(false);
      expect(DOM_FILTERS.isFormattingOnly('!')).toBe(false);
    });

    it('should return false for empty and non-string values', () => {
      expect(DOM_FILTERS.isFormattingOnly('')).toBe(false);
      expect(DOM_FILTERS.isFormattingOnly(null)).toBe(false);
      expect(DOM_FILTERS.isFormattingOnly(undefined)).toBe(false);
    });
  });
});
