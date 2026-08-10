import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDetectLanguage, browserMock, mockShouldApplyRtl } = vi.hoisted(() => {
  const mDetect = vi.fn();
  return {
    mockDetectLanguage: mDetect,
    mockShouldApplyRtl: vi.fn(),
    browserMock: {
      runtime: {
        getBrowserInfo: () => ({}),
        getManifest: () => ({ version: '1.0.0' }),
        sendMessage: vi.fn(),
        onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn(), set: vi.fn(), remove: vi.fn(), clear: vi.fn() },
        sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      i18n: {
        getMessage: (key) => key,
        detectLanguage: mDetect,
      },
    },
  };
});

vi.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: browserMock,
}));

vi.mock('@/shared/utils/text/textAnalysis.js', () => ({
  isRTL: vi.fn(),
  getDirection: vi.fn(),
  getScriptFamily: vi.fn(),
  shouldApplyRtl: mockShouldApplyRtl,
  detectArabicScriptLanguage: vi.fn(),
  detectChineseScriptLanguage: vi.fn(),
  detectDevanagariScriptLanguage: vi.fn(),
  detectLatinScriptLanguage: vi.fn(),
  isSingleWordOrShortPhrase: vi.fn(),
  isPersianText: vi.fn(),
  isArabicScriptText: vi.fn(),
  isCjkScriptText: vi.fn(),
  isLatinScriptText: vi.fn(),
  isChineseScriptText: vi.fn(),
  isDevanagariScriptText: vi.fn(),
  applyElementDirection: vi.fn(),
  correctTextDirection: vi.fn(),
  ARABIC_SCRIPT_LANGUAGES: [],
  CHINESE_SCRIPT_LANGUAGES: [],
  DEVANAGARI_SCRIPT_LANGUAGES: [],
  LATIN_SCRIPT_PRIORITY_LANGUAGES: [],
}));

vi.mock('@/shared/config/config.js', () => ({
  getLanguageDetectionPreferencesAsync: vi.fn(async () => ({
    'latin-script': 'none',
    'arabic-script': 'fa',
    'chinese-script': 'zh-cn',
    'devanagari-script': 'hi',
    targetLanguage: 'en',
  })),
}));

import { LanguageDetectionService, sanitizeDetectionSample, SOURCE_V3_SEGMENT_MARKER_REGEX } from './LanguageDetectionService.js';
import * as textAnalysis from '@/shared/utils/text/textAnalysis.js';

// Canonical marker fixtures matching BlockGroupReconstructor.injectMarkers() output
// Format: @@TI_SEG_<entropy>_<sessionId>_n<number>@@ or @@TI_SEG_<sessionId>_n<number>@@
// sessionId: s + Math.random().toString(36).substr(2, 6) → 0-6 base36 chars (DomTranslatorAdapter.js:110)
//   Empty suffix possible when Math.random() === 0 (probability ~2^-53, no retry/validation guard)
// entropy: Math.random().toString(36).substr(2, 4) → 1-4 base36 chars, optional (DomTranslatorAdapter.js:111)
//   Empty entropy is skipped by truthiness check in BlockGroupReconstructor.js:45
// segment id: n + positive integer (pre-incremented from 0, first ID is n1) (DomTranslatorUtils.js:454-455)
const SESSION_ID = 'sabc123';
const ENTROPY = 'xy12';
const M1 = `@@TI_SEG_${SESSION_ID}_n1@@`;
const M2 = `@@TI_SEG_${ENTROPY}_${SESSION_ID}_n2@@`;
const HIGH_MARKER = `@@TI_SEG_${SESSION_ID}_n999@@`;

describe('LanguageDetectionService - Direction Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isRTL', () => {
    it('should identify RTL language codes', () => {
      expect(LanguageDetectionService.isRTL('fa')).toBe(true);
      expect(LanguageDetectionService.isRTL('ar')).toBe(true);
      expect(LanguageDetectionService.isRTL('he')).toBe(true);
    });

    it('should identify RTL language names', () => {
      expect(LanguageDetectionService.isRTL('Persian')).toBe(true);
      expect(LanguageDetectionService.isRTL('Arabic')).toBe(true);
    });

    it('should identify LTR language codes', () => {
      expect(LanguageDetectionService.isRTL('en')).toBe(false);
      expect(LanguageDetectionService.isRTL('ja')).toBe(false);
    });
  });

  describe('getDirection', () => {
    it('should prioritize explicit langCode', () => {
      expect(LanguageDetectionService.getDirection('Hello', 'fa')).toBe('rtl');
    });

    it('should fall back to content analysis if langCode is missing or auto', () => {
      vi.mocked(textAnalysis.shouldApplyRtl).mockReturnValue(true);
      expect(LanguageDetectionService.getDirection('سلام', 'auto')).toBe('rtl');

      vi.mocked(textAnalysis.shouldApplyRtl).mockReturnValue(false);
      expect(LanguageDetectionService.getDirection('Hello', null)).toBe('ltr');
    });

    it('should default to ltr if no info available', () => {
      expect(LanguageDetectionService.getDirection(null, null)).toBe('ltr');
    });
  });
});

describe('LanguageDetectionService - sanitizeDetectionSample', () => {
  it('A. should replace a single canonical V3 marker with a neutral space boundary', () => {
    const input = `Hello${M1}world`;
    expect(sanitizeDetectionSample(input)).toBe('Hello world');
  });

  it('B. should replace multiple canonical markers with single spaces', () => {
    const input = `A${M1}B${M2}C`;
    expect(sanitizeDetectionSample(input)).toBe('A B C');
  });

  it('C. should preserve existing whitespace when markers are present', () => {
    const input = `A  ${M1}   B`;
    // 2 original spaces + 1 marker-replaced space + 3 original spaces = 6 spaces
    expect(sanitizeDetectionSample(input)).toBe('A      B');
  });

  it('D. should leave paragraph structure unchanged when no markers', () => {
    const input = 'First paragraph.\n\nSecond paragraph.';
    expect(sanitizeDetectionSample(input)).toBe('First paragraph.\n\nSecond paragraph.');
  });

  it('E. should preserve tabs when no markers', () => {
    const input = 'A\t\tB';
    expect(sanitizeDetectionSample(input)).toBe('A\t\tB');
  });

  it('F. should preserve CRLF when no markers', () => {
    const input = 'A\r\n\r\nB';
    expect(sanitizeDetectionSample(input)).toBe('A\r\n\r\nB');
  });

  it('G. should preserve NBSP when no markers', () => {
    const input = 'A\u00A0B';
    expect(sanitizeDetectionSample(input)).toBe('A\u00A0B');
  });

  it('H. should replace marker with space but preserve surrounding newlines', () => {
    const input = `A\n${M1}\nB`;
    expect(sanitizeDetectionSample(input)).toBe('A\n \nB');
  });

  it('I. should leave ordinary user @@ text unchanged', () => {
    const input = 'email me at @@example@@ please';
    expect(sanitizeDetectionSample(input)).toBe('email me at @@example@@ please');
  });

  it('J. should leave malformed marker-like input unchanged', () => {
    const input = '@@TI_SEG_not-complete';
    expect(sanitizeDetectionSample(input)).toBe('@@TI_SEG_not-complete');
  });

  it('K. should return empty string for marker-only input', () => {
    expect(sanitizeDetectionSample(M1)).toBe('');
  });

  it('D-ext. should handle high counter numbers in canonical markers', () => {
    const input = `Hello${HIGH_MARKER}world`;
    expect(sanitizeDetectionSample(input)).toBe('Hello world');
  });

  it('E-ext. should preserve fake marker @@TI_SEG_xyz_123@@ (not canonical)', () => {
    const input = '@@TI_SEG_xyz_123@@';
    expect(sanitizeDetectionSample(input)).toBe('@@TI_SEG_xyz_123@@');
  });

  it('F-ext. should preserve fake marker @@TI_SEG_foo@@ (not canonical)', () => {
    const input = '@@TI_SEG_foo@@';
    expect(sanitizeDetectionSample(input)).toBe('@@TI_SEG_foo@@');
  });

  it('G-ext. should preserve empty fake marker @@TI_SEG_@@', () => {
    const input = '@@TI_SEG_@@';
    expect(sanitizeDetectionSample(input)).toBe('@@TI_SEG_@@');
  });

  it('H-ext. should preserve whitespace-corrupted markers on source side', () => {
    const input = `@@ TI_SEG _ ${SESSION_ID} _ n1 @@`;
    expect(sanitizeDetectionSample(input)).toBe(`@@ TI_SEG _ ${SESSION_ID} _ n1 @@`);
  });

  it('I-ext. should preserve wrong suffix markers (node1, not n1)', () => {
    const input = `@@TI_SEG_${SESSION_ID}_node1@@`;
    expect(sanitizeDetectionSample(input)).toBe(`@@TI_SEG_${SESSION_ID}_node1@@`);
  });

  it('J-ext. should preserve ordinary documentation text containing @@TI_SEG_@@', () => {
    const input = 'Docs: @@TI_SEG_xyz_123@@';
    expect(sanitizeDetectionSample(input)).toBe('Docs: @@TI_SEG_xyz_123@@');
  });

  it('K-ext. should return falsy input unchanged', () => {
    expect(sanitizeDetectionSample('')).toBe('');
    expect(sanitizeDetectionSample(null)).toBe(null);
    expect(sanitizeDetectionSample(undefined)).toBe(undefined);
  });

  it('L-ext. should not mutate the original input string', () => {
    const original = `Hello${M1}world`;
    const snapshot = original;
    sanitizeDetectionSample(original);
    expect(original).toBe(snapshot);
  });

  it('M-ext. should only strip valid V3 markers, not arbitrary @@ text', () => {
    const input = '@@not-a-segment-marker@@';
    expect(sanitizeDetectionSample(input)).toBe('@@not-a-segment-marker@@');
  });
});

describe('LanguageDetectionService - detect() V3 Sanitization Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    LanguageDetectionService.clearSessionCache();
  });

  it('should pass sanitized text (markers replaced with spaces) to browser.i18n.detectLanguage', async () => {
    const input = `Hello @ world this is a test of marker sanitization${M1}with markers${M2}in it`;
    const expectedSanitized = 'Hello @ world this is a test of marker sanitization with markers in it';

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });

    const result = await LanguageDetectionService.detect(input, { __auditCaller: 'test' });

    expect(mockDetectLanguage).toHaveBeenCalledTimes(1);
    expect(mockDetectLanguage).toHaveBeenCalledWith(expectedSanitized);
    expect(result).toBe('en');
  });

  it('should replace multiple markers and preserve surrounding whitespace in detect() path', async () => {
    const input = `Sentence A\n${M1}\nSentence B\n${M2}\nSentence C end padding text`;
    const expectedSanitized = 'Sentence A\n \nSentence B\n \nSentence C end padding text';

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 95 }],
    });

    await LanguageDetectionService.detect(input, { __auditCaller: 'test' });

    expect(mockDetectLanguage).toHaveBeenCalledWith(expectedSanitized);
  });

  it('should pass text unchanged to browser.i18n.detectLanguage when no V3 markers', async () => {
    const input = 'This is a long enough English sentence without markers for testing detection path';

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });

    await LanguageDetectionService.detect(input, { __auditCaller: 'test' });

    expect(mockDetectLanguage).toHaveBeenCalledWith(input);
  });

  it('should not mutate the original text passed to detect()', async () => {
    const input = `Hello${M1}world this is long enough to trigger statistical detection path`;

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });

    const original = input;
    await LanguageDetectionService.detect(input, { __auditCaller: 'test' });
    expect(input).toBe(original);
  });

  it('should use cache key based on original text (cache hit skips statistical)', async () => {
    const input = `Cache me please${M1}long enough text for cache verification test`;

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });

    await LanguageDetectionService.detect(input, { __auditCaller: 'test' });
    expect(mockDetectLanguage).toHaveBeenCalledTimes(1);

    LanguageDetectionService.registerDetectionResult(input, 'en', { url: 'https://example.com' });

    mockDetectLanguage.mockClear();
    const cachedResult = await LanguageDetectionService.detect(input, {
      __auditCaller: 'test',
      url: 'https://example.com',
    });
    expect(mockDetectLanguage).not.toHaveBeenCalled();
    expect(cachedResult).toBe('en');
  });

  it('should preserve ordinary @@ user text in detect() path (not stripped)', async () => {
    const input = `Note: @@important@@ in this${M1}long enough text for detection path testing`;

    mockDetectLanguage.mockResolvedValue({
      isReliable: true,
      languages: [{ language: 'en', percentage: 100 }],
    });

    await LanguageDetectionService.detect(input, { __auditCaller: 'test' });

    const calledArg = mockDetectLanguage.mock.calls[0][0];
    expect(calledArg).toContain('@@important@@');
    expect(calledArg).not.toContain('@@TI_SEG_');
  });
});

describe('LanguageDetectionService - SOURCE_V3_SEGMENT_MARKER_REGEX', () => {
  // --- Positive cases (canonical producer output) ---

  it('should match canonical marker (sessionId only, no entropy)', () => {
    // Producer: @@TI_SEG_<sessionId>_<n\d>@@ (BlockGroupReconstructor.js:48)
    // sessionId = s[a-z0-9]{1,6} (DomTranslatorAdapter.js:110)
    expect(`@@TI_SEG_sabc123_n1@@`.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
  });

  it('should match canonical marker (with entropy prefix)', () => {
    // Producer: @@TI_SEG_<entropy>_<sessionId>_<n\d>@@ (BlockGroupReconstructor.js:46)
    // entropy = [a-z0-9]{1,4} (DomTranslatorAdapter.js:111)
    expect(`@@TI_SEG_xy12_sabc123_n2@@`.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
  });

  it('should match canonical marker with high node number (n999)', () => {
    expect(`@@TI_SEG_sabc123_n999@@`.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
  });

  it('should match canonical marker with lowest node number (n1)', () => {
    // Counter is pre-incremented from 0: nodeCounter++; uid = `n${nodeCounter}`
    // (DomTranslatorUtils.js:454-455), so first ID is always n1, never n0
    expect(`@@TI_SEG_sabc123_n1@@`.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
  });

  it('should match canonical marker with shortest valid sessionId (s + empty suffix edge case)', () => {
    // sessionId: `s${Math.random().toString(36).substr(2, 6)}` — suffix can be
    // 0-6 chars. When Math.random() === 0, suffix is empty: sessionId = 's'
    // (DomTranslatorAdapter.js:110, no retry/validation guard)
    expect(`@@TI_SEG_s_n1@@`.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
  });

  // --- Negative cases (NOT generated by the producer) ---

  it('should NOT match literal ENTROPY in marker body', () => {
    // Uppercase E is impossible: Math.random().toString(36) only produces [a-z0-9]
    // (DomTranslatorAdapter.js:110-111)
    expect('@@TI_SEG_ENTROPY_sabc123_n2@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match fake marker @@TI_SEG_xyz_123@@', () => {
    // No session ID prefix s, no n\d segment suffix
    expect('@@TI_SEG_xyz_123@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match fake marker @@TI_SEG_foo@@', () => {
    // No session ID prefix s, no n\d segment suffix
    expect('@@TI_SEG_foo@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match empty @@TI_SEG_@@', () => {
    // Empty body between SEG_ and @@ — no session ID or segment ID
    expect('@@TI_SEG_@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match @@TI_SEG_____n1@@ (empty segment components)', () => {
    // Multiple underscores with no valid sessionId or segment ID
    expect('@@TI_SEG_____n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match @@TI_SEG_hello_world_n1@@', () => {
    // hello is not a valid sessionId (must start with s)
    // world is not a valid entropy (no s-prefixed sessionId follows)
    expect('@@TI_SEG_hello_world_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match uppercase @@TI_SEG_sABC123_n1@@', () => {
    // Uppercase impossible: Math.random().toString(36) only produces [a-z0-9]
    expect('@@TI_SEG_sABC123_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match whitespace-corrupted @@ TI_SEG _ sabc123 _ n1 @@', () => {
    // Source markers never contain internal whitespace; produced via pure
    // string concatenation with no spaces (BlockGroupReconstructor.js:55)
    expect('@@ TI_SEG _ sabc123 _ n1 @@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match wrong suffix @@TI_SEG_sabc123_node1@@', () => {
    // Producer always generates n\d+ for segment IDs, not arbitrary strings
    expect('@@TI_SEG_sabc123_node1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match ordinary @@example@@', () => {
    expect('@@example@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  it('should NOT match ordinary @@important@@', () => {
    expect('@@important@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
  });

  describe('Producer boundary cases', () => {
    // PRODUCIBLE (empty suffix from Math.random() === 0, probability ~2^-53)
    it('PRODUCIBLE: @@TI_SEG_s_n1@@ (Math.random() === 0 → empty sessionId suffix)', () => {
      // Producer: `s${Math.random().toString(36).substr(2, 6)}`
      // When Math.random() === 0: (0).toString(36) = '0', '0'.substr(2,6) = ''
      // So sessionId = 's', which IS a valid producer output (no retry/validation)
      expect('@@TI_SEG_s_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
    });

    it('PRODUCIBLE: @@TI_SEG_xy12_s_n1@@ (empty sessionId suffix with entropy)', () => {
      // Same empty-suffix edge case, but with entropy branch:
      // @@TI_SEG_<entropy>_<sessionId>_n<id>@@ with sessionId = 's'
      expect('@@TI_SEG_xy12_s_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
    });

    it('PRODUCIBLE: @@TI_SEG_sabc123_n1@@ (canonical common case)', () => {
      expect('@@TI_SEG_sabc123_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
    });

    it('PRODUCIBLE: @@TI_SEG_xy12_sabc123_n1@@ (canonical common case with entropy)', () => {
      expect('@@TI_SEG_xy12_sabc123_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).not.toBeNull();
    });

    // IMPOSSIBLE (counter is pre-incremented from 0, first ID is n1)
    it('IMPOSSIBLE: @@TI_SEG_s_n0@@ (n0 impossible — counter pre-incremented)', () => {
      // nodeCounter starts at 0, then: nodeCounter++; uid = `n${nodeCounter}`
      // So first id is always n1 (DomTranslatorUtils.js:454-455)
      expect('@@TI_SEG_s_n0@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
    });

    it('IMPOSSIBLE: @@TI_SEG_xy12_s_n0@@ (same counter logic applies with entropy)', () => {
      expect('@@TI_SEG_xy12_s_n0@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
    });

    // IMPOSSIBLE (empty entropy is skipped, not rendered as empty component)
    it('IMPOSSIBLE: @@TI_SEG__s_n1@@ (double underscore — empty entropy skipped by truthiness check)', () => {
      // BlockGroupReconstructor.js:45: if (entropy && sessionId) picks entropy branch
      // If entropy === '', the else-if (sessionId only) branch runs instead.
      // So @@TI_SEG__s_n1@@ is never produced.
      expect('@@TI_SEG__s_n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
    });

    it('IMPOSSIBLE: @@TI_SEG__n1@@ (no sessionId, empty entropy — impossible)', () => {
      // Requires both entropy and sessionId to be empty; no path produces this form
      expect('@@TI_SEG__n1@@'.match(SOURCE_V3_SEGMENT_MARKER_REGEX)).toBeNull();
    });
  });
});
