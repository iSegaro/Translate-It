import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockGroupReconstructor } from './BlockGroupReconstructor.js';
import { TranslationUnit } from '@/features/translation/ir/TranslationUnit.js';
import { hoverPreviewLookup } from '@/features/shared/hover-preview/HoverPreviewLookup.js';

// Mock logger
vi.mock('@/shared/logging/logger.js', () => ({
  getScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }))
}));

describe('BlockGroupReconstructor', () => {
  let units;
  let textNodes;

  beforeEach(() => {
    document.body.innerHTML = '';
    
    // Create actual text DOM nodes
    const div = document.createElement('div');
    div.className = 'container';
    div.innerHTML = '<span>Hello </span><strong>world</strong><i>.</i>';
    document.body.appendChild(div);

    textNodes = [
      div.childNodes[0].firstChild, // "Hello "
      div.childNodes[1].firstChild, // "world"
      div.childNodes[2].firstChild  // "."
    ];

    units = [
      new TranslationUnit({
        id: 'n1',
        blockId: 'g1',
        text: 'Hello',
        leadingWS: '',
        trailingWS: ' ',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['span'],
        mode: 'standard'
      }),
      new TranslationUnit({
        id: 'n2',
        blockId: 'g1',
        text: 'world',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['strong'],
        mode: 'standard'
      }),
      new TranslationUnit({
        id: 'n3',
        blockId: 'g1',
        text: '.',
        leadingWS: '',
        trailingWS: '',
        preWhitespace: false,
        directionHint: 'ltr',
        inlineParentTags: ['i'],
        mode: 'standard'
      })
    ];

    // Assign text node references
    units[0].node = textNodes[0];
    units[1].node = textNodes[1];
    units[2].node = textNodes[2];
  });

  describe('injectMarkers', () => {
    it('should inject printable markers correctly at segment boundaries using ASCII @@', () => {
      const assembledText = BlockGroupReconstructor.injectMarkers(units);
      expect(assembledText).toBe('Hello@@SEG_n2@@world@@SEG_n3@@.');
    });

    it('should support session-scoped markers', () => {
      const assembledText = BlockGroupReconstructor.injectMarkers(units, 'abc');
      expect(assembledText).toBe('Hello@@TI_SEG_abc_n2@@world@@TI_SEG_abc_n3@@.');
    });
  });

  describe('splitTranslatedBlock & Corruption Detection', () => {
    it('should split translated text correctly into expected segments', () => {
      const translated = 'مرحبا @@SEG_n2@@بالعالم@@SEG_n3@@.';
      const segments = BlockGroupReconstructor.splitTranslatedBlock(translated, units);

      expect(segments.length).toBe(3);
      expect(segments[0]).toEqual({ id: 'n1', text: 'مرحبا ' });
      expect(segments[1]).toEqual({ id: 'n2', text: 'بالعالم' });
      expect(segments[2]).toEqual({ id: 'n3', text: '.' });
    });

    it('should be robust to LLM fuzzing (spaces/casing) inside markers', () => {
      const translated = 'مرحبا @@  seg_n2  @@بالعالم@@  SEG_n3  @@.';
      const segments = BlockGroupReconstructor.splitTranslatedBlock(translated, units);
      expect(segments.length).toBe(3);
      expect(segments[1].id).toBe('n2');
    });

    it('should reject foreign session IDs', () => {
      const translated = 'مرحبا @@TI_SEG_wrong_n2@@بالعالم@@TI_SEG_wrong_n3@@.';
      expect(() => BlockGroupReconstructor.splitTranslatedBlock(translated, units, 'abc')).toThrow();
    });

    it('should detect and reject duplicate marker attempts (as count mismatch)', () => {
      const duplicated = 'مرحبا @@SEG_n2@@بالعالم@@SEG_n2@@@@SEG_n3@@.';
      expect(() => BlockGroupReconstructor.splitTranslatedBlock(duplicated, units)).toThrow(/Segment count mismatch/);
    });

    it('should detect and reject reordered markers', () => {
      const reordered = 'مرحبا @@SEG_n3@@.@@SEG_n2@@بالعالم';
      expect(() => BlockGroupReconstructor.splitTranslatedBlock(reordered, units)).toThrow(/Segment UID sequence mismatch/);
    });
  });

  describe('Validation Resilience', () => {
    it('should accept hydration adjustments but reject content changes', () => {
      textNodes[0].nodeValue = 'Hello\u00A0'; // nbsp
      const translated = 'مرحبا @@SEG_n2@@بالعالم@@SEG_n3@@.';
      expect(BlockGroupReconstructor.apply(units, translated, 'fa', document.body)).toBe(true);
    });

    it('should reject semantic content changes', () => {
      textNodes[0].nodeValue = 'Helloworld'; // Space removed
      const translated = 'مرحبا @@SEG_n2@@بالعالم@@SEG_n3@@.';
      expect(() => BlockGroupReconstructor.apply(units, translated, 'fa', document.body)).toThrow();
    });
  });

  describe('Invisible Character Defenses', () => {
    it('should normalize markers containing ZWSP but preserve ZWSP in content', () => {
      // Marker has ZWSP (\u200b) injected by model
      const translated = 'مرحبا @@SEG\u200b_n2@@\u200bبالعالم@@SEG_n3@@';
      
      // Sanitization happens in apply(), so we test it here
      BlockGroupReconstructor.apply(units, translated, 'fa', document.body);
      expect(textNodes[1].nodeValue).toContain('\u200bبالعالم'); // ZWSP in content preserved
    });
  });

  describe('Edge Case Hardening', () => {
    it('should handle Emoji grapheme clusters safely', () => {
      const emojiUnits = [
        new TranslationUnit({ id: 'n1', blockId: 'e1', text: '👨‍👩‍👧‍👦', leadingWS: '', trailingWS: '' })
      ];
      const div = document.createElement('div');
      document.body.appendChild(div);
      const textNode = document.createTextNode('👨‍👩‍👧‍👦');
      div.appendChild(textNode);
      emojiUnits[0].node = textNode;

      const translated = '🌈';
      BlockGroupReconstructor.apply(emojiUnits, translated, 'en', div);
      expect(textNode.nodeValue).toBe('🌈');
    });

    it('should handle ZWJ Persian sequences', () => {
      const zwjUnits = [
        new TranslationUnit({ id: 'n1', blockId: 'z1', text: 'می‌روم', leadingWS: '', trailingWS: '' })
      ];
      const div = document.createElement('div');
      document.body.appendChild(div);
      const textNode = document.createTextNode('می‌روم');
      div.appendChild(textNode);
      zwjUnits[0].node = textNode;

      const translated = 'می‌روم';
      BlockGroupReconstructor.apply(zwjUnits, translated, 'fa', div);
      expect(textNode.nodeValue).toContain('می‌روم');
    });
  });
});
