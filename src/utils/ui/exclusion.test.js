import { describe, it, expect } from 'vitest';
import { matchesAutoTranslateRule } from './exclusion.js';

describe('exclusion matching utilities', () => {
  describe('matchesAutoTranslateRule', () => {
    it('should return false for empty or invalid rules', () => {
      const url = 'https://example.com/page';
      expect(matchesAutoTranslateRule(url, '')).toBe(false);
      expect(matchesAutoTranslateRule(url, '   ')).toBe(false);
      expect(matchesAutoTranslateRule(url, null)).toBe(false);
      expect(matchesAutoTranslateRule('invalid-url', 'example.com')).toBe(false);
      expect(matchesAutoTranslateRule(url, 'invalid\\url')).toBe(false);
    });

    it('should match file scheme paths exactly only', () => {
      const url = 'file:///home/user/document.html';
      expect(matchesAutoTranslateRule(url, 'file:///home/user/document.html')).toBe(true);
      expect(matchesAutoTranslateRule(url, 'file:///home/user/other.html')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com', 'file:///home/user/document.html')).toBe(false);
    });

    it('should handle full URL rules with protocol matching', () => {
      const urlHttps = 'https://example.com/docs';
      const urlHttp = 'http://example.com/docs';

      // Protocol matches
      expect(matchesAutoTranslateRule(urlHttps, 'https://example.com')).toBe(true);
      expect(matchesAutoTranslateRule(urlHttp, 'http://example.com')).toBe(true);

      // Protocol mismatch
      expect(matchesAutoTranslateRule(urlHttps, 'http://example.com')).toBe(false);
      expect(matchesAutoTranslateRule(urlHttp, 'https://example.com')).toBe(false);
    });

    it('should match subdomains or exact hostname on full URL rules', () => {
      expect(matchesAutoTranslateRule('https://example.com/page', 'https://example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/page', 'https://example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://deep.sub.example.com/page', 'https://example.com')).toBe(true);
      
      expect(matchesAutoTranslateRule('https://notexample.com/page', 'https://example.com')).toBe(false);
      expect(matchesAutoTranslateRule('https://fake-example.com/page', 'https://example.com')).toBe(false);
    });

    it('should check prefix of pathname for full URL rules', () => {
      expect(matchesAutoTranslateRule('https://example.com/docs', 'https://example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/docs/page', 'https://example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/docs-directory', 'https://example.com/docs')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com/blog', 'https://example.com/docs')).toBe(false);
    });

    it('should match domain and path rules without protocol', () => {
      // Direct and subdomain matching without protocol
      expect(matchesAutoTranslateRule('https://example.com/page', 'example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/page', 'example.com')).toBe(true);
      expect(matchesAutoTranslateRule('http://example.com/page', 'example.com')).toBe(true);

      // Should not match false positives
      expect(matchesAutoTranslateRule('https://notexample.com/page', 'example.com')).toBe(false);
      expect(matchesAutoTranslateRule('https://fake-example.com/page', 'example.com')).toBe(false);

      // Path prefix matching without protocol
      expect(matchesAutoTranslateRule('https://example.com/docs', 'example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/docs/page', 'example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/docs/page', 'example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/blog', 'example.com/docs')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com/docs-directory', 'example.com/docs')).toBe(false);
    });

    it('should support optional leading wildcard rules (*.)', () => {
      expect(matchesAutoTranslateRule('https://example.com/page', '*.example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/page', '*.example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://deep.sub.example.com/page', '*.example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://notexample.com/page', '*.example.com')).toBe(false);
      
      expect(matchesAutoTranslateRule('https://example.com/docs/page', '*.example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/docs/page', '*.example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/blog', '*.example.com/docs')).toBe(false);
    });
  });
});
