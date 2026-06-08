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

    it('1. exact domain without wildcard matches root page only (ignoring protocol)', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com', 'example.com')).toBe(true);
      expect(matchesAutoTranslateRule('http://example.com/', 'example.com')).toBe(true);

      // Does NOT match subdomains or subpages
      expect(matchesAutoTranslateRule('https://example.com/page', 'example.com')).toBe(false);
      expect(matchesAutoTranslateRule('https://sub.example.com', 'example.com')).toBe(false);
    });

    it('2. domain with path wildcard matches root and any subpages', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com', 'example.com/*')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/page', 'example.com/*')).toBe(true);
      expect(matchesAutoTranslateRule('http://example.com/docs/page', 'example.com/*')).toBe(true);

      // Does NOT match subdomains
      expect(matchesAutoTranslateRule('https://sub.example.com/page', 'example.com/*')).toBe(false);
    });

    it('3. wildcard domain matches root and subdomains exactly on root path', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com', '*.example.com')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com', '*.example.com')).toBe(true);

      // Does NOT match subpages or different domains
      expect(matchesAutoTranslateRule('https://example.com/page', '*.example.com')).toBe(false);
      expect(matchesAutoTranslateRule('https://sub.example.com/page', '*.example.com')).toBe(false);
      expect(matchesAutoTranslateRule('https://notexample.com', '*.example.com')).toBe(false);
    });

    it('4. wildcard domain and path wildcard matches root/subdomains and any subpages', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com', '*.example.com/*')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/page', '*.example.com/*')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com', '*.example.com/*')).toBe(true);
      expect(matchesAutoTranslateRule('https://sub.example.com/page', '*.example.com/*')).toBe(true);

      // Does NOT match other domains
      expect(matchesAutoTranslateRule('https://notexample.com/page', '*.example.com/*')).toBe(false);
    });

    it('5. domain with exact path matches that path exactly (ignoring trailing slash and protocol)', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com/docs', 'example.com/docs')).toBe(true);
      expect(matchesAutoTranslateRule('http://example.com/docs/', 'example.com/docs')).toBe(true);

      // Does NOT match subpages or other paths
      expect(matchesAutoTranslateRule('https://example.com/docs/page', 'example.com/docs')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com/docs-archive', 'example.com/docs')).toBe(false);
    });

    it('6. domain with path wildcard matches directory and any subpages', () => {
      // Matches
      expect(matchesAutoTranslateRule('https://example.com/docs', 'example.com/docs/*')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/docs/page', 'example.com/docs/*')).toBe(true);
      expect(matchesAutoTranslateRule('http://example.com/docs/nested/page', 'example.com/docs/*')).toBe(true);

      // Does NOT match sibling paths or other domains
      expect(matchesAutoTranslateRule('https://example.com/docs-archive', 'example.com/docs/*')).toBe(false);
      expect(matchesAutoTranslateRule('https://sub.example.com/docs/page', 'example.com/docs/*')).toBe(false);
    });

    it('7. full URL rules ignore http vs https, require exact match unless wildcarded', () => {
      // Ignore protocol
      expect(matchesAutoTranslateRule('http://example.com/page', 'https://example.com/page')).toBe(true);
      expect(matchesAutoTranslateRule('https://example.com/page', 'http://example.com/page')).toBe(true);

      // Require exact match of path
      expect(matchesAutoTranslateRule('https://example.com/page/child', 'https://example.com/page')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com/page/child', 'https://example.com/page/*')).toBe(true);
    });

    it('8. file scheme paths match exactly only', () => {
      const url = 'file:///home/user/document.html';
      expect(matchesAutoTranslateRule(url, 'file:///home/user/document.html')).toBe(true);
      expect(matchesAutoTranslateRule(url, 'file:///home/user/other.html')).toBe(false);
      expect(matchesAutoTranslateRule('https://example.com', 'file:///home/user/document.html')).toBe(false);
    });
  });
});
