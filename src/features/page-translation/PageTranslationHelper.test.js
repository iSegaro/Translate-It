import { describe, it, expect, vi } from 'vitest';
import { PageTranslationHelper } from './PageTranslationHelper.js';

describe('PageTranslationHelper', () => {
  describe('normalizeText', () => {
    it('should trim and collapse whitespace', () => {
      expect(PageTranslationHelper.normalizeText('  hello   world  ')).toBe('hello world');
      expect(PageTranslationHelper.normalizeText('\n hello \t world \n')).toBe('hello world');
    });

    it('should return empty string for null/undefined', () => {
      expect(PageTranslationHelper.normalizeText(null)).toBe('');
      expect(PageTranslationHelper.normalizeText(undefined)).toBe('');
    });
  });

  describe('shouldTranslate', () => {
    it('should return false for empty or whitespace-only strings', () => {
      expect(PageTranslationHelper.shouldTranslate('')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('   ')).toBe(false);
    });

    it('should return false for pure integer strings', () => {
      expect(PageTranslationHelper.shouldTranslate('123')).toBe(false);
    });

    it('should return true for decimal strings (current implementation limit)', () => {
      expect(PageTranslationHelper.shouldTranslate('12.3')).toBe(true);
    });

    it('should return false for time strings', () => {
      expect(PageTranslationHelper.shouldTranslate('12:30')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('1:20:30')).toBe(false);
    });

    it('should return false for metric strings', () => {
      expect(PageTranslationHelper.shouldTranslate('100k')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('1.5M')).toBe(false);
    });

    it('should return false for too short non-RTL strings', () => {
      expect(PageTranslationHelper.shouldTranslate('A')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate(' ')).toBe(false);
    });

    it('should return true for RTL strings regardless of length (if not empty)', () => {
      // In helper: isTooShort = trimmed.length < 2 && !/[\u0600-\u06FF]/.test(trimmed);
      // Farsi character is \u0600-\u06FF
      expect(PageTranslationHelper.shouldTranslate('آ')).toBe(true); 
    });

    it('should return true for valid sentences', () => {
      expect(PageTranslationHelper.shouldTranslate('Hello World')).toBe(true);
      expect(PageTranslationHelper.shouldTranslate('This is a test.')).toBe(true);
    });

    it('should return false for technical patterns (Email, URL, etc.)', () => {
      expect(PageTranslationHelper.shouldTranslate('test@example.com')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('https://google.com')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('www.site.co')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('#ffffff')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('v1.2.3')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('1.2.3-beta')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('/usr/bin/local')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('C:\\Windows\\System32')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('#Programming')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('@username')).toBe(false);
      expect(PageTranslationHelper.shouldTranslate('#KingRezaPahlavi‌ForIran')).toBe(false); // With ZWNJ
      expect(PageTranslationHelper.shouldTranslate('#Tag1 #Tag2')).toBe(false); // Multiple tags
      expect(PageTranslationHelper.shouldTranslate('@user1 @user2 #tag')).toBe(false); // Mixed multiple
    });
  });

  describe('isInViewportWithMargin', () => {
    it('should return true if element is in viewport', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      
      // Mock getBoundingClientRect
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        top: 100,
        bottom: 200,
        left: 100,
        right: 200,
        width: 100,
        height: 100
      });
      
      // Mock window dimensions
      Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true });
      Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true });
      
      expect(PageTranslationHelper.isInViewportWithMargin(element, 100)).toBe(true);
    });

    it('should return false if element is out of viewport beyond margin', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        top: 2000,
        bottom: 2100,
        left: 0,
        right: 100,
        width: 100,
        height: 100
      });
      
      expect(PageTranslationHelper.isInViewportWithMargin(element, 100)).toBe(false);
    });
    
    it('should return false for invisible elements (0x0)', () => {
      const element = document.createElement('div');
      vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
        width: 0,
        height: 0
      });
      expect(PageTranslationHelper.isInViewportWithMargin(element, 100)).toBe(false);
    });

    it('should handle text nodes correctly using Range', () => {
      const parent = document.createElement('div');
      const textNode = document.createTextNode('sample text');
      parent.appendChild(textNode);
      document.body.appendChild(parent);

      // Mock Range
      const mockRect = {
        top: 100,
        bottom: 200,
        left: 100,
        right: 200,
        width: 100,
        height: 100
      };
      
      const mockRange = {
        selectNodeContents: vi.fn(),
        getBoundingClientRect: vi.fn().mockReturnValue(mockRect)
      };
      
      // Mock createRange to return our mock object
      vi.spyOn(document, 'createRange').mockReturnValue(mockRange);
      
      const result = PageTranslationHelper.isInViewportWithMargin(textNode, 100);
      
      expect(result).toBe(true);
      expect(mockRange.selectNodeContents).toHaveBeenCalledWith(textNode);
    });
  });
});
