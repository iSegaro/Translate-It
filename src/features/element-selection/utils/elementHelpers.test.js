import { describe, it, expect, vi, beforeEach } from 'vitest';
import helpers from './elementHelpers.js';

const {
  extractTextFromElement,
  hasValidTextContent,
  isValidTextElement,
  findBestContainer,
  isCommonUIWord,
  getImmediateTextContent,
  isRTLText,
  getDirectionFromLanguage,
  isInteractiveElement,
  debounce,
  sanitizeHTML,
  generateElementId,
  isInViewport
} = helpers;

describe('elementHelpers', () => {
  describe('extractTextFromElement', () => {
    it('should return empty string for null element', () => {
      expect(extractTextFromElement(null)).toBe('');
    });

    it('should extract text from a regular element', () => {
      const el = document.createElement('div');
      el.textContent = '  Hello World  ';
      expect(extractTextFromElement(el)).toBe('Hello World');
    });

    it('should extract value from INPUT element', () => {
      const el = document.createElement('input');
      el.value = ' Input Value ';
      expect(extractTextFromElement(el)).toBe('Input Value');
    });

    it('should extract value from TEXTAREA element', () => {
      const el = document.createElement('textarea');
      el.value = ' Textarea Value ';
      expect(extractTextFromElement(el)).toBe('Textarea Value');
    });
  });

  describe('hasValidTextContent', () => {
    it('should return false for empty text', () => {
      const el = document.createElement('div');
      expect(hasValidTextContent(el)).toBe(false);
    });

    it('should return true for valid text', () => {
      const el = document.createElement('div');
      el.textContent = 'This is a valid sentence.';
      expect(hasValidTextContent(el)).toBe(true);
    });

    it('should return false if text length is less than minTextLength', () => {
      const el = document.createElement('div');
      el.textContent = 'abc';
      expect(hasValidTextContent(el, { minTextLength: 5 })).toBe(false);
    });

    it('should return false if word count is less than minWordCount', () => {
      const el = document.createElement('div');
      el.textContent = 'Hello';
      expect(hasValidTextContent(el, { minWordCount: 2 })).toBe(false);
    });

    it('should return false for pure numbers and symbols', () => {
      const el = document.createElement('div');
      el.textContent = '123 !!! ###';
      expect(hasValidTextContent(el)).toBe(false);
    });

    it('should return false for standalone URLs', () => {
      const el = document.createElement('div');
      el.textContent = 'https://google.com';
      expect(hasValidTextContent(el)).toBe(false);
    });

    it('should return false for email addresses', () => {
      const el = document.createElement('div');
      el.textContent = 'test@example.com';
      expect(hasValidTextContent(el)).toBe(false);
    });
  });

  describe('isValidTextElement', () => {
    it('should return false for script/style tags', () => {
      const script = document.createElement('script');
      script.textContent = 'console.log("test")';
      expect(isValidTextElement(script)).toBe(false);

      const style = document.createElement('style');
      style.textContent = 'body { color: red; }';
      expect(isValidTextElement(style)).toBe(false);
    });

    it('should return false for invisible elements', () => {
      const el = document.createElement('div');
      el.textContent = 'Visible text but hidden style';
      
      // Mock getComputedStyle
      vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        display: 'none',
        visibility: 'visible',
        opacity: '1'
      });
      
      expect(isValidTextElement(el)).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('isCommonUIWord', () => {
    it('should return true for common UI words', () => {
      expect(isCommonUIWord('OK')).toBe(true);
      expect(isCommonUIWord('Cancel')).toBe(true);
      expect(isCommonUIWord('submit')).toBe(true);
    });

    it('should return false for non-UI words', () => {
      expect(isCommonUIWord('Hello')).toBe(false);
      expect(isCommonUIWord('Translate It')).toBe(false);
    });
  });

  describe('getImmediateTextContent', () => {
    it('should return only immediate text nodes', () => {
      const el = document.createElement('div');
      el.innerHTML = 'Parent text <span>Child text</span> more parent text';
      expect(getImmediateTextContent(el)).toBe('Parent text  more parent text');
    });
  });

  describe('isRTLText', () => {
    it('should detect RTL text', () => {
      expect(isRTLText('سلام دنیا')).toBe(true); // Persian
      expect(isRTLText('Hello World')).toBe(false); // English
    });
  });

  describe('getDirectionFromLanguage', () => {
    it('should return rtl for RTL languages', () => {
      expect(getDirectionFromLanguage('fa')).toBe('rtl');
      expect(getDirectionFromLanguage('ar-SA')).toBe('rtl');
    });

    it('should return ltr for others', () => {
      expect(getDirectionFromLanguage('en')).toBe('ltr');
      expect(getDirectionFromLanguage('ja')).toBe('ltr');
    });
  });

  describe('isInteractiveElement', () => {
    it('should identify interactive elements', () => {
      const btn = document.createElement('button');
      expect(isInteractiveElement(btn)).toBe(true);

      const div = document.createElement('div');
      div.setAttribute('role', 'button');
      expect(isInteractiveElement(div)).toBe(true);
    });
  });

  describe('sanitizeHTML', () => {
    it('should remove script tags', () => {
      const html = '<div>Safe</div><script>alert(1)</script>';
      expect(sanitizeHTML(html)).not.toContain('<script>');
    });

    it('should remove event handlers', () => {
      const html = '<div onclick="alert(1)">Click</div>';
      expect(sanitizeHTML(html)).not.toContain('onclick');
    });
  });

  describe('generateElementId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateElementId();
      const id2 = generateElementId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^element-/);
    });
  });

  describe('findBestContainer', () => {
    it('should return startElement if it has enough text', () => {
      const el = document.createElement('div');
      el.textContent = 'This is a long enough text for testing container search.';
      Object.defineProperties(el, {
        offsetWidth: { value: 100 },
        offsetHeight: { value: 100 }
      });
      
      const best = findBestContainer(el, { minTextLength: 10 });
      expect(best).toBe(el);
    });

    it('should search ancestors for a better container', () => {
      const parent = document.createElement('div');
      parent.textContent = 'This is a long parent container text.';
      Object.defineProperties(parent, {
        offsetWidth: { value: 200 },
        offsetHeight: { value: 100 }
      });

      const child = document.createElement('span');
      child.textContent = 'Small child';
      parent.appendChild(child);

      const best = findBestContainer(child, { minTextLength: 20 });
      expect(best).toBe(parent);
    });

    it('should respect maxArea constraint', () => {
      const parent = document.createElement('div');
      parent.textContent = 'This is a long parent container text.';
      Object.defineProperties(parent, {
        offsetWidth: { value: 1000 }, // Large area: 1000 * 1000 = 1,000,000
        offsetHeight: { value: 1000 }
      });

      const child = document.createElement('span');
      child.textContent = 'Small child';
      parent.appendChild(child);

      const best = findBestContainer(child, { minTextLength: 20, maxArea: 50000 });
      expect(best).toBe(child); // Should NOT pick parent because it's too large
    });
  });

  describe('debounce', () => {
    it('should delay function execution', () => {
      vi.useFakeTimers();
      const func = vi.fn();
      const debounced = debounce(func, 100);

      debounced();
      debounced();
      debounced();

      expect(func).not.toBeCalled();

      vi.advanceTimersByTime(100);
      expect(func).toBeCalledTimes(1);
      vi.useRealTimers();
    });
  });

  describe('isInViewport', () => {
    it('should return true if element is within bounds', () => {
      const el = document.createElement('div');
      el.getBoundingClientRect = vi.fn(() => ({
        top: 10,
        left: 10,
        bottom: 100,
        right: 100,
        width: 90,
        height: 90
      }));

      // Set window dimensions
      window.innerHeight = 1000;
      window.innerWidth = 1000;

      expect(isInViewport(el)).toBe(true);
    });

    it('should return false if element is outside bounds', () => {
      const el = document.createElement('div');
      el.getBoundingClientRect = vi.fn(() => ({
        top: -100,
        left: 10,
        bottom: -10,
        right: 100
      }));

      expect(isInViewport(el)).toBe(false);
    });
  });
});
