import { describe, it, expect } from 'vitest';
import { ShadowComparisonEngine } from './ShadowComparisonEngine.js';

describe('ShadowComparisonEngine', () => {
  describe('normalizeText', () => {
    it('should collapse whitespace and trim leading/trailing space', () => {
      const input = '   Hello    world\n\t  ';
      expect(ShadowComparisonEngine.normalizeText(input)).toBe('Hello world');
    });

    it('should strip layout-invisible bidirectional formatting marks', () => {
      const input = '\u200fHello \u200eworld\u202c\u200c';
      expect(ShadowComparisonEngine.normalizeText(input)).toBe('Hello world');
    });
  });

  describe('compare', () => {
    it('should confirm equivalence for identical text nodes', () => {
      const nodeA = document.createTextNode('Hello world');
      const nodeB = document.createTextNode('Hello world');
      const result = ShadowComparisonEngine.compare(nodeA, nodeB);
      
      expect(result.equivalent).toBe(true);
      expect(result.reason).toBeNull();
    });

    it('should confirm equivalence for text nodes with minor spacing and BiDi differences', () => {
      const nodeA = document.createTextNode('\u200fHello    world  ');
      const nodeB = document.createTextNode('  Hello \u200eworld\t');
      const result = ShadowComparisonEngine.compare(nodeA, nodeB);

      expect(result.equivalent).toBe(true);
    });

    it('should detect mismatch for text nodes with different content', () => {
      const nodeA = document.createTextNode('Hello');
      const nodeB = document.createTextNode('Goodbye');
      const result = ShadowComparisonEngine.compare(nodeA, nodeB);

      expect(result.equivalent).toBe(false);
      expect(result.reason).toContain('Text content mismatch');
    });

    it('should confirm equivalence for identical element structures', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span class="test">Hello <strong>world</strong></span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span class="test">Hello <strong>world</strong></span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(true);
    });

    it('should tolerate compiler injected data-v-* attributes, key/ref properties, and data-block-id', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span class="test" data-v-123456="true" data-block-id="g1" key="1">Hello</span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span class="test" data-v-abcdef="true" ref="spanEl">Hello</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(true);
    });

    it('should tolerate dynamic translation-injected layout direction attributes and style overrides', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span class="test">Hello</span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span class="test" data-translate-dir="rtl" data-dir-original-saved="true" data-has-original="true" data-original-direction="ltr" style="direction: rtl; unicode-bidi: isolate; max-width: 100%; text-align: right;">Hello</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(true);
    });

    it('should tolerate volatile attribute differences like title, alt, and placeholder (often modified by side-effect observers)', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<a title="" alt="">Hello</a>';
      const elB = document.createElement('div');
      elB.innerHTML = '<a title="Translated Title" alt="Translated Alt" placeholder="Translated Placeholder">Hello</a>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(true);
    });

    it('should tolerate harmless style spacing variations', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span style="direction: rtl; text-align: center;">Hello</span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span style="DIRECTION:RTL;TEXT-ALIGN:CENTER">Hello</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(true);
    });

    it('should detect mismatch for different tag names', () => {
      const elA = document.createElement('div');
      const elB = document.createElement('span');
      const result = ShadowComparisonEngine.compare(elA, elB);

      expect(result.equivalent).toBe(false);
      expect(result.reason).toContain('TagName mismatch');
    });

    it('should detect mismatch for different attribute values', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span class="active">Hello</span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span class="disabled">Hello</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(false);
      expect(result.reason).toContain('Attributes mismatch');
    });

    it('should detect mismatch for child counts', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span>1</span><span>2</span>';
      const elB = document.createElement('div');
      elB.innerHTML = '<span>1</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(false);
      expect(result.reason).toContain('Child count mismatch');
    });

    it('should detect mismatch for swapped tags', () => {
      const elA = document.createElement('div');
      elA.innerHTML = '<span>Hello</span><strong>world</strong>';
      const elB = document.createElement('div');
      elB.innerHTML = '<strong>Hello</strong><span>world</span>';

      const result = ShadowComparisonEngine.compare(elA, elB);
      expect(result.equivalent).toBe(false);
      expect(result.reason).toContain('TagName mismatch');
    });
  });
});
