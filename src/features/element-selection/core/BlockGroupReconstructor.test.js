import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlockGroupReconstructor } from './BlockGroupReconstructor.js';
import { TranslationUnit } from '@/features/translation/ir/TranslationUnit.js';

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
    it('should inject printable markers correctly at segment boundaries', () => {
      const assembledText = BlockGroupReconstructor.injectMarkers(units);
      expect(assembledText).toBe('Hello[--SEG:n2--]world[--SEG:n3--].');
    });

    it('should return empty string if units array is empty', () => {
      expect(BlockGroupReconstructor.injectMarkers([])).toBe('');
      expect(BlockGroupReconstructor.injectMarkers(null)).toBe('');
    });
  });

  describe('splitTranslatedBlock & Corruption Detection', () => {
    it('should split translated text correctly into expected segments', () => {
      const translated = 'مرحبا [--SEG:n2--]بالعالم[--SEG:n3--].';
      const segments = BlockGroupReconstructor.splitTranslatedBlock(translated, units);

      expect(segments.length).toBe(3);
      expect(segments[0]).toEqual({ id: 'n1', text: 'مرحبا ' });
      expect(segments[1]).toEqual({ id: 'n2', text: 'بالعالم' });
      expect(segments[2]).toEqual({ id: 'n3', text: '.' });
    });

    it('should throw an error if a marker is missing or segment count mismatches', () => {
      const corrupted = 'مرحبا بالعالم.';
      expect(() => BlockGroupReconstructor.splitTranslatedBlock(corrupted, units)).toThrow(
        /Segment count mismatch/
      );
    });

    it('should throw an error if marker UID sequence order is violated', () => {
      const sequenceBroken = 'مرحبا [--SEG:n3--]بالعالم[--SEG:n2--].';
      expect(() => BlockGroupReconstructor.splitTranslatedBlock(sequenceBroken, units)).toThrow(
        /Segment UID sequence mismatch/
      );
    });
  });

  describe('apply & Pre-Apply DOM Connection Revalidation', () => {
    it('should apply translations atomically to DOM nodes with whitespace restoration and unescaping', () => {
      const originalParent = textNodes[0].parentElement;
      const translated = '  مرحبا   [--SEG:n2--]بالعالم  [--SEG:n3--]  [--ESCAPED_SEG:n4--]  ';

      const result = BlockGroupReconstructor.apply(units, translated);

      expect(result).toBe(true);

      // Verify whitespace boundary restoration and trimming
      expect(textNodes[0].nodeValue).toBe('مرحبا '); // original trailingWS is ' ', leadingWS is ''
      expect(textNodes[1].nodeValue).toBe('بالعالم'); // leading/trailingWS are both ''
      
      // Verify unescaping of escaped marker sequence
      expect(textNodes[2].nodeValue).toBe('[--SEG:n4--]');
    });

    it('should abort DOM mutation entirely and throw error if a text node is detached', () => {
      // Detach the second node
      textNodes[1].remove();

      // Verify that calling apply throws
      expect(() => BlockGroupReconstructor.apply(units, 'مرحبا [--SEG:n2--]بالعالم[--SEG:n3--].')).toThrow(
        /Stale or detached DOM node reference/
      );

      // All-or-nothing: First node should not be mutated because apply aborted before write phase
      expect(textNodes[0].nodeValue).toBe('Hello ');
    });

    it('should toggle flicker prevention classes synchronously', () => {
      const parent = textNodes[0].parentElement;
      
      // Spy on classList
      const addSpy = vi.spyOn(parent.classList, 'add');
      const removeSpy = vi.spyOn(parent.classList, 'remove');

      BlockGroupReconstructor.apply(units, 'مرحبا [--SEG:n2--]بالعالم[--SEG:n3--].');

      expect(addSpy).toHaveBeenCalledWith('ti-translating');
      expect(removeSpy).toHaveBeenCalledWith('ti-translating');
    });
  });
});
