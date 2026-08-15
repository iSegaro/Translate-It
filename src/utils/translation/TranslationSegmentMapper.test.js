import { describe, it, expect } from 'vitest';
import { TranslationSegmentMapper } from './TranslationSegmentMapper.js';

/**
 * TranslationSegmentMapper Unit Tests
 *
 * Owns: standard/alternative delimiter splitting, blank positional mapping,
 * word-ratio fallback, cardinality/mismatch behavior.
 *
 * Does NOT own: Lingva provider-level request construction, budget partitioning,
 * subgroup composition, or failure atomicity. Those belong to LingvaProvider.test.js.
 */

const LINGVA_DELIMITER = '\n\n---\n\n';
const STANDARD_DELIMITER = '\n[[---]]\n';

/**
 * Invoke the mapper the same way BaseTranslateProvider._traditionalBatchTranslate()
 * does: joined string + STANDARD_DELIMITER as the primary delimiter.
 */
function mapAsLingvaWould(translatedJoined, originalSegments) {
  return TranslationSegmentMapper.mapTranslationToOriginalSegments(
    translatedJoined, originalSegments, STANDARD_DELIMITER, 'Lingva'
  );
}

describe('TranslationSegmentMapper', () => {

  // ── Lingva delimiter: correct cardinality ──────────────────────────────

  describe('Lingva delimiter split — correct cardinality', () => {
    it('["A", "B"] → "TA" + delim + "TB" → ["TA", "TB"]', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB', ['A', 'B']
      )).toEqual(['TA', 'TB']);
    });

    it('["A", "", "B"] → preserves blank at index 1', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + 'TB', ['A', '', 'B']
      )).toEqual(['TA', '', 'TB']);
    });

    it('["", "A"] → preserves leading blank', () => {
      expect(mapAsLingvaWould(
        '' + LINGVA_DELIMITER + 'TA', ['', 'A']
      )).toEqual(['', 'TA']);
    });

    it('["A", ""] → preserves trailing blank', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + '', ['A', '']
      )).toEqual(['TA', '']);
    });

    it('["A", "", "B", "", "C"] → preserves multiple blanks', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + 'TB' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + 'TC',
        ['A', '', 'B', '', 'C']
      )).toEqual(['TA', '', 'TB', '', 'TC']);
    });

    it('["", "", ""] → all blanks preserved', () => {
      expect(mapAsLingvaWould(
        '' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + '', ['', '', '']
      )).toEqual(['', '', '']);
    });

    it('[""] → single blank segment', () => {
      expect(mapAsLingvaWould('', [''])).toEqual(['']);
    });

    it('position count always matches source count', () => {
      const sources = ['A', '', 'B', '', 'C'];
      const result = mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + 'TB' + LINGVA_DELIMITER + '' + LINGVA_DELIMITER + 'TC',
        sources
      );
      expect(result.length).toBe(sources.length);
    });
  });

  // ── Standard / alternative delimiter fallback ──────────────────────────

  describe('delimiter fallback', () => {
    it('splits on \\n[[---]]\\n when present', () => {
      expect(TranslationSegmentMapper.mapTranslationToOriginalSegments(
        'TA\n[[---]]\nTB', ['A', 'B'], STANDARD_DELIMITER, 'Test'
      )).toEqual(['TA', 'TB']);
    });

    it('tries ALTERNATIVE_DELIMITERS when standard fails', () => {
      expect(TranslationSegmentMapper.mapTranslationToOriginalSegments(
        'TA\n\n---\n\nTB', ['A', 'B'], STANDARD_DELIMITER, 'Test'
      )).toEqual(['TA', 'TB']);
    });
  });

  // ── Word-ratio fallback ────────────────────────────────────────────────

  describe('word-ratio fallback', () => {
    it('sets result[i] = "" for blank originals', () => {
      const result = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        'translated content here', ['A', '', 'B'], STANDARD_DELIMITER, 'Test'
      );
      expect(result.length).toBe(3);
      expect(result[1]).toBe('');
    });

    it('single non-empty original maps everything to it', () => {
      const result = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        'translated text', ['', 'A', ''], STANDARD_DELIMITER, 'Test'
      );
      expect(result).toEqual(['', 'translated text', '']);
    });
  });

  // ── Single-segment / edge cases ────────────────────────────────────────

  describe('edge cases', () => {
    it('single original segment returns scrubbed text', () => {
      const result = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        'only one', ['A'], STANDARD_DELIMITER, 'Test'
      );
      expect(result).toEqual(['only one']);
    });

    it('null translatedText returns scrubbed fallback', () => {
      const result = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        null, ['A', 'B'], STANDARD_DELIMITER, 'Test'
      );
      expect(result).toEqual([null]);
    });

    it('empty translatedText with non-blank source returns fallback', () => {
      const result = TranslationSegmentMapper.mapTranslationToOriginalSegments(
        '', ['A', 'B'], STANDARD_DELIMITER, 'Test'
      );
      expect(result.length).toBe(1);
    });
  });

  // ── Missing-blank mismatch matrix (Case A — already safe) ──────────────

  describe('missing-blank mismatch — Case A: safe reconstruction', () => {
    // These document the ACTUAL mapper behavior when the provider response
    // drops blank segments. All cases produce the safe expected result.

    it('["A", "", "B"] response "TA" + delim + "TB" (blank dropped) → ["TA", "", "TB"]', () => {
      // 2 delimiter segments vs 3 originals → structural count mismatches total
      // Source-aware blank reconstruction maps 2 parts to 2 nonblank originals
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB', ['A', '', 'B']
      )).toEqual(['TA', '', 'TB']);
    });

    it('["", "A"] response "TA" (blank source, 1 segment) → ["", "TA"]', () => {
      // Single non-empty original path: maps everything to index 1
      expect(mapAsLingvaWould('TA', ['', 'A'])).toEqual(['', 'TA']);
    });

    it('["A", ""] response "TA" (blank source, 1 segment) → ["TA", ""]', () => {
      // Single non-empty original path: maps everything to index 0
      expect(mapAsLingvaWould('TA', ['A', ''])).toEqual(['TA', '']);
    });

    it('["", "A", ""] response "TA" (2 blanks dropped) → ["", "TA", ""]', () => {
      // Single non-empty original path
      expect(mapAsLingvaWould('TA', ['', 'A', ''])).toEqual(['', 'TA', '']);
    });
  });

  // ── Unsafe mismatch cases ──────────────────────────────────────────────

  describe('unsafe mismatch — cardinality too far off', () => {
    it('["A", "", "B"] response "TA" (1 word vs 2 nonblanks) → throws INCOMPLETE_CARDINALITY', () => {
      // No delimiter found → word-ratio distribution. Nonblank source "B" receives no
      // translated content → partial coverage must fail loudly, never return silent gaps.
      expect(() => mapAsLingvaWould('TA', ['A', '', 'B'])).toThrow(
        expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY })
      );
    });

    it('["A", "", "B", "", "C"] response "TA" + LingvaDelim + "TB" (2 parts vs 3 nonblanks) → throws INCOMPLETE_CARDINALITY', () => {
      // Structural delimiter '\n\n---\n\n' present, 2 translated parts vs 3 nonblanks → incomplete
      expect(() => mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB', ['A', '', 'B', '', 'C']
      )).toThrow(expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY }));
    });

    it('["A", "B", "C"] response "TA" + LingvaDelim + "TB" (2 parts vs 3 originals) → throws INCOMPLETE_CARDINALITY', () => {
      // Structural delimiter '\n\n---\n\n' present, 2 translated parts vs 3 originals → incomplete
      expect(() => mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB', ['A', 'B', 'C']
      )).toThrow(expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY }));
    });

    it('["A", "", "B"] response empty string → returns single-element fallback', () => {
      // Empty string early return → [scrub('')] = ['']
      // This IS a cardinality defect: 1 element returned for 3 originals
      const result = mapAsLingvaWould('', ['A', '', 'B']);
      expect(result).toEqual(['']);
    });
  });

  // ── Word-ratio coverage policy ─────────────────────────────────────────

  describe('word-ratio coverage — full coverage passes', () => {
    it('["A","B"] "one two three four five" → all nonblank receive text', () => {
      expect(mapAsLingvaWould('one two three four five', ['A', 'B']))
        .toEqual(['one two three', 'four five']);
    });

    it('["A","B","C"] "TA TB TC" → full coverage', () => {
      expect(mapAsLingvaWould('TA TB TC', ['A', 'B', 'C']))
        .toEqual(['TA', 'TB', 'TC']);
    });

    it('source-equal output remains valid', () => {
      expect(mapAsLingvaWould('A B', ['A', 'B'])).toEqual(['A', 'B']);
    });

    it('blank originals preserved alongside full coverage', () => {
      expect(mapAsLingvaWould('TA TB', ['A', '', 'B'])).toEqual(['TA', '', 'TB']);
    });

    it('all-blank sources remain fully valid', () => {
      expect(mapAsLingvaWould('anything', ['', '', ''])).toEqual(['', '', '']);
    });
  });

  describe('word-ratio coverage — partial coverage throws', () => {
    it('1 translated word for 3 nonblank originals → throws', () => {
      expect(() => mapAsLingvaWould('TA', ['A', 'B', 'C'])).toThrow(
        expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY })
      );
    });

    it('2 translated words for 3 nonblank originals → throws', () => {
      expect(() => mapAsLingvaWould('TA TB', ['A', 'B', 'C'])).toThrow(
        expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY })
      );
    });

    it('RTL short translation → throws', () => {
      expect(() => mapAsLingvaWould('Hello', ['سلام', 'دنیا'])).toThrow(
        expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY })
      );
    });

    it('CJK one-token translation → throws', () => {
      expect(() => mapAsLingvaWould('Hello', ['你好', '世界'])).toThrow(
        expect.objectContaining({ type: TranslationSegmentMapper.INCOMPLETE_CARDINALITY })
      );
    });
  });

  // ── Multiline safety ─────────────────────────────────────────────────────

  describe('multiline safety — ordinary newlines never hard-fail', () => {
    it('["A", "B", "C"] response "line one\\nline two" → no INCOMPLETE_CARDINALITY', () => {
      // Generic '\n' is formatting, not a structural segment marker.
      // Falls through to word-ratio fallback, preserving existing behavior.
      const result = mapAsLingvaWould('line one\nline two', ['A', 'B', 'C']);
      expect(result.length).toBe(3);
    });

    it('["A", "B", "C"] response "paragraph one\\n\\nparagraph two" → no INCOMPLETE_CARDINALITY', () => {
      // Generic '\n\n' paragraph separation must not throw solely for newline formatting.
      const result = mapAsLingvaWould('paragraph one\n\nparagraph two', ['A', 'B', 'C']);
      expect(result.length).toBe(3);
    });
  });

  // ── Source-aware blank reconstruction ────────────────────────────────────

  describe('source-aware blank reconstruction', () => {
    it('translated parts match nonblank count → reconstructs with blanks preserved', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB', ['A', '', 'B']
      )).toEqual(['TA', '', 'TB']);
    });

    it('4 nonblanks with 4 translations → blanks at correct positions', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB' + LINGVA_DELIMITER + 'TC' + LINGVA_DELIMITER + 'TD',
        ['A', '', 'B', 'C', '', 'D']
      )).toEqual(['TA', '', 'TB', 'TC', '', 'TD']);
    });

    it('blanks at start and end → correct positional reconstruction', () => {
      expect(mapAsLingvaWould(
        'TA' + LINGVA_DELIMITER + 'TB',
        ['', 'A', 'B', '']
      )).toEqual(['', 'TA', 'TB', '']);
    });
  });
});
