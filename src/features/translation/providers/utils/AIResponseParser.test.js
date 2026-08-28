import { describe, it, expect, vi } from 'vitest';
import { AIResponseParser } from './AIResponseParser.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { TranslationContractValidator } from '@/features/translation/core/TranslationContractValidator.js';
import { createManifestView, createRequestUnitManifest, MappingStrategy } from '@/features/translation/ir/RequestUnitManifest.js';
import { createTranslationOperation } from '@/features/translation/ir/TranslationOperation.js';
import { createCompletionRecord, CompletionTermination } from '@/features/translation/ir/CompletionContract.js';

describe('AIResponseParser', () => {
  it('emits bounded mapping diagnostics with accurate totals and no response text', () => {
    const operation = createTranslationOperation('parser-diagnostics');
    const originalBatch = Array.from({ length: 40 }, (_, index) => ({ id: `request-${index}`, text: `source-${index}` }));
    const response = JSON.stringify({
      translations: originalBatch.map(({ id }) => ({ id, text: '' })),
    });

    const result = AIResponseParser.parseBatchResult(
      response,
      originalBatch.length,
      originalBatch,
      'MockAI',
      ResponseFormat.JSON_OBJECT,
      { operation },
    );
    const diagnostic = operation.finalize().entries.find(({ type }) => type === 'PARSER_MAPPING_FACTS');

    expect(diagnostic).toMatchObject({
      type: 'PARSER_MAPPING_FACTS',
      provider: 'MockAI',
      requestCount: 40,
      responseCount: 40,
      invalidCount: 40,
      invalidTextCount: 40,
      requestIdsTotal: 40,
      responseIdsTotal: 40,
      invalidTextIndexesTotal: 40,
      arraysTruncated: true,
    });
    expect(diagnostic.requestIds).toHaveLength(32);
    expect(diagnostic.responseIds).toHaveLength(32);
    expect(diagnostic.invalidTextIndexes).toHaveLength(32);
    expect(JSON.stringify(diagnostic)).not.toContain('source-0');
    expect(result.parserDiagnostics.requestIds).toHaveLength(32);
    expect(result.parserDiagnostics.requestIdsTotal).toBe(40);
  });

  it('does not emit mapping diagnostics for healthy structured responses', () => {
    const operation = createTranslationOperation('parser-healthy');
    const originalBatch = [{ id: 'request-1', text: 'source-1' }, { id: 'request-2', text: 'source-2' }];

    AIResponseParser.parseBatchResult(
      '{"translations":[{"id":"request-1","text":"translated-1"},{"id":"request-2","text":"translated-2"}]}',
      originalBatch.length,
      originalBatch,
      'MockAI',
      ResponseFormat.JSON_OBJECT,
      { operation },
    );

    expect(operation.finalize().entries.some(({ type }) => type === 'PARSER_MAPPING_FACTS')).toBe(false);
  });

  describe('cleanAIResponse - String Format', () => {
    it('should strip markdown code blocks', () => {
      const input = '```\nHello World\n```';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello World');
    });

    it('should strip json markdown blocks', () => {
      const input = '```json\n{"text": "سلام"}\n```';
      // When format is STRING, it should try to extract the text from JSON if possible
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('سلام');
    });

    it('should cleanup hidden unicode characters', () => {
      // \u200B is Zero Width Space
      const input = 'Hello\u200BWorld';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('HelloWorld');
    });

    it('should unescape unicode sequences in raw strings', () => {
      // \u0648 is 'و' in Arabic/Persian
      const input = 'Hello \\u0648 World';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello و World');
    });
    
    it('should handle double-escaped unicode', () => {
      const input = 'Hello \\\\u0648 World';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello و World');
    });

    it('should restore single newline markers in raw strings', () => {
      const input = 'Hello<n1/>World';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello\nWorld');
    });

    it('should restore double newline markers in raw strings', () => {
      const input = 'Hello<n2/>World';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello\n\nWorld');
    });

    it('should preserve empty parsed text as an empty string', () => {
      const input = '{"text": ""}';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('');
    });

    it('should restore a marker-only empty-like string to a newline marker expansion', () => {
      const input = '<n2/>';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('\n\n');
    });

    it('should leave normal text unchanged when no markers are present', () => {
      const input = 'Hello World';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello World');
    });
  });

  describe('cleanAIResponse - JSON Format', () => {
    it('should parse a valid JSON array', () => {
      const input = '["item1", "item2"]';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.JSON_ARRAY);
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should extract JSON from surrounded text', () => {
      const input = 'Here is your result: ```json\n["test"]\n``` Hope it helps!';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.JSON_ARRAY);
      expect(result).toEqual(['test']);
    });
    
    it('should heal single quotes in JSON', () => {
      // This tests the Healers.PreProcessors logic for weak AI models
      const input = "{'translations': ['test']}";
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.JSON_OBJECT);
      expect(result).toEqual({ translations: ['test'] });
    });

    it('should restore newline markers when JSON string values are parsed through the string fallback', () => {
      const input = '{"text":"Hello<n2/>World"}';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('Hello\n\nWorld');
    });

    it('should still fall back to stripped behavior for undefined-style malformed content', () => {
      const input = 'undefined';
      const result = AIResponseParser.cleanAIResponse(input, ResponseFormat.STRING);
      expect(result).toBe('undefined');
    });
  });

  describe('parseBatchResult manifest validation', () => {
    it('maps string numeric response IDs positionally for plain-string batches', () => {
      const result = AIResponseParser.parseBatchResult(
        '{"translations":[{"id":"0","text":"AA"},{"id":"1","text":"BB"},{"id":"2","text":"CC"}]}',
        3,
        ['A', 'B', 'C'],
        'WebAI',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result).toEqual({
        results: ['AA', 'BB', 'CC'],
        contractViolation: false,
      });
    });

    it('accepts a structured response preserving a runtime segment marker', () => {
      const text = 'Commons@@TI_SEG_ab12_session_n8@@Free media collection';
      const result = AIResponseParser.parseBatchResult(
        `{"translations":[{"id":"0","text":"${text}"}]}`,
        1,
        [text],
        'WebAI',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result).toEqual({ results: [text], contractViolation: false });
    });

    it('maps numeric response IDs positionally for plain-string batches', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":0,"text":"AA"},{"id":1,"text":"BB"},{"id":2,"text":"CC"}]',
        3,
        ['A', 'B', 'C'],
      );

      expect(result).toEqual({ results: ['AA', 'BB', 'CC'], contractViolation: false });
    });

    it('restores shuffled plain-string response IDs to canonical request order', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":2,"text":"TC"},{"id":0,"text":"TA"},{"id":1,"text":"TB"}]',
        3,
        ['A', 'B', 'C'],
      );

      expect(result).toEqual({ results: ['TA', 'TB', 'TC'], contractViolation: false });
    });

    it('keeps object batch mapping identity-based', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"y","text":"BB"},{"id":"x","text":"AA"}]',
        2,
        [{ id: 'x', text: 'A' }, { id: 'y', text: 'B' }],
      );

      expect(result).toEqual({ results: ['AA', 'BB'], contractViolation: false });
    });

    it.each([
      ['unknown ID', '[{"id":"9","text":"AA"},{"id":"1","text":"BB"}]'],
      ['duplicate ID', '[{"id":"0","text":"AA"},{"id":"0","text":"BB"}]'],
      ['missing ID', '[{"id":"0","text":"AA"}]'],
    ])('keeps %s as a contract violation', (_label, response) => {
      const result = AIResponseParser.parseBatchResult(response, 2, ['A', 'B']);

      expect(result.contractViolation).toBe(true);
    });

    it('keeps unknown identity mapping unavailable for selective recovery', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"unknown","text":"AA"},{"id":"1","text":"BB"}]',
        2,
        [{ i: 'g1', t: 'A' }, { i: 'g2', t: 'B' }],
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        {},
        createManifestView(createRequestUnitManifest([{ i: 'g1', t: 'A' }, { i: 'g2', t: 'B' }])),
      );

      expect(result.mappingFacts).toEqual({ identityReliable: false, complete: false, ambiguous: true });
      expect(result.invalidUnits.every(({ requestIndex }) => requestIndex === null)).toBe(true);
    });

    it('rejects duplicate mappings even when every requested slot is filled', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"0","text":"first"},{"id":"0","text":"replacement"},{"id":"1","text":"second"}]',
        2,
        ['A', 'B'],
      );

      expect(result.contractViolation).toBe(true);
    });

    it('exposes reliable V3 invalid-unit indexes and exact violation codes', () => {
      const originalBatch = [
        { i: 'g1', t: 'A' },
        { i: 'g2', t: 'A@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts' },
        { i: 'g3', t: 'C' },
      ];
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [
          { id: 'g1', text: 'AA' },
          { id: 'g2', text: 'خرید@@TI_SEG_e1_s1_n13@@ @@TI_SEG_e1_s1_n14@@الکترونیک آرتس' },
          { id: 'g3', text: 'CC' },
        ] }),
        3,
        originalBatch,
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        {},
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          requestIndex: 1,
          responseId: 'g2',
          violationCodes: expect.arrayContaining(['V3_EMPTY_TRANSLATED_INTERVAL']),
        }),
      ]);
      expect(result.mappingFacts).toEqual({ identityReliable: true, complete: true, ambiguous: false });
      expect(result.repairContext).toMatchObject({
        reason: expect.stringContaining('V3_EMPTY_TRANSLATED_INTERVAL'),
        affectedUnits: [expect.objectContaining({
          requestIndex: 1,
          responseId: 'g2',
          markerId: 'n13',
          sourceText: 'video game publisher',
        })],
      });
    });

    it('reaches selective recovery facts for V3 orphan delimiter residue', () => {
      const originalBatch = [
        { i: 'g1', t: 'A' },
        { i: 'g2', t: 'A@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts' },
        { i: 'g3', t: 'C' },
      ];
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [
          { id: 'g1', text: 'AA' },
          { id: 'g2', text: 'خرید@@TI_SEG_e1_s1_n13@@ناشر بازی‌ها@@TI_SEG_e1_s1_n14@@الکترونیک آرتس@@' },
          { id: 'g3', text: 'CC' },
        ] }),
        3,
        originalBatch,
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        {},
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.contractViolation).toBe(true);
      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          requestIndex: 1,
          responseId: 'g2',
          violationCodes: expect.arrayContaining(['V3_ORPHAN_DELIMITER']),
        }),
      ]);
      expect(result.mappingFacts).toEqual({ identityReliable: true, complete: true, ambiguous: false });
      expect(result.repairContext).toMatchObject({
        reason: expect.stringContaining('V3_ORPHAN_DELIMITER'),
        affectedUnits: [expect.objectContaining({
          requestIndex: 1,
          responseId: 'g2',
          markerId: 'n14',
          sourceText: 'Electronic Arts',
        })],
      });
    });

    it('uses manifest identity mapping rather than response order for invalid indexes', () => {
      const originalBatch = [
        { i: 'g1', t: 'A' },
        { i: 'g2', t: 'A@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts' },
        { i: 'g3', t: 'C' },
      ];
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [
          { id: 'g3', text: 'CC' },
          { id: 'g1', text: 'AA' },
          { id: 'g2', text: 'خرید@@TI_SEG_e1_s1_n13@@ @@TI_SEG_e1_s1_n14@@الکترونیک آرتس' },
        ] }),
        3,
        originalBatch,
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        {},
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.invalidUnits).toEqual([
        expect.objectContaining({ requestIndex: 1, responseId: 'g2' }),
      ]);
    });

    it('validates numeric provider wire IDs against positional context for logical source batches', () => {
      const sourceBatch = [
        'A',
        'A@@TI_SEG_e1_s1_n13@@video game publisher@@TI_SEG_e1_s1_n14@@Electronic Arts',
        'C',
      ];
      const manifestSource = [
        { i: 'g1', t: sourceBatch[0] },
        { i: 'g2', t: sourceBatch[1] },
        { i: 'g3', t: sourceBatch[2] },
      ];
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [
          { id: '0', text: 'AA' },
          { id: '1', text: 'خرید@@TI_SEG_e1_s1_n13@@ @@TI_SEG_e1_s1_n14@@الکترونیک آرتس' },
          { id: '2', text: 'CC' },
        ] }),
        3,
        sourceBatch,
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        {},
        createManifestView(createRequestUnitManifest(manifestSource)),
      );

      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          requestIndex: 1,
          responseId: '1',
          violationCodes: expect.arrayContaining(['V3_EMPTY_TRANSLATED_INTERVAL']),
        }),
      ]);
      expect(result.invalidUnits).toHaveLength(1);
      expect(result.mappingFacts).toEqual({ identityReliable: true, complete: true, ambiguous: false });
    });

    it('rejects null translated text for a non-empty source', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"0","text":null}]',
        1,
        ['A'],
      );

      expect(result.contractViolation).toBe(true);
    });

    it('accepts matching numeric IDs for object identity batches', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":0,"text":"AA"},{"id":1,"text":"BB"}]',
        2,
        [{ id: 0, text: 'A' }, { id: 1, text: 'B' }],
      );

      expect(result.contractViolation).toBe(false);
    });

    it('rejects numeric positional fallback for object string identities', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":0,"text":"AA"},{"id":"y","text":"BB"}]',
        2,
        [{ id: 'x', text: 'A' }, { id: 'y', text: 'B' }],
      );

      expect(result.contractViolation).toBe(true);
      expect(result.mappingFacts.identityReliable).toBe(false);
      expect(result.mappingFacts.ambiguous).toBe(true);
    });

    it('accepts harmless unknown surplus output with a warning diagnostic', () => {
      const operation = createTranslationOperation('harmless-surplus');
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"0","text":"AA"},{"id":"1","text":"BB"},{"id":"99","text":"unused"}]',
        2,
        ['A', 'B'],
        'WebAI',
        ResponseFormat.JSON_OBJECT,
        { operation },
      );

      expect(result).toEqual({ results: ['AA', 'BB'], contractViolation: false });
      expect(operation.finalize().entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'STRUCTURED_CONTRACT_WARNING', code: 'HARMLESS_SURPLUS_RESPONSE' })
      ]));
    });

    it('accepts positional surplus output when requested units are complete', () => {
      const result = AIResponseParser.parseBatchResult(
        '["AA","BB","unused"]',
        2,
        ['A', 'B'],
      );

      expect(result).toEqual({ results: ['AA', 'BB'], contractViolation: false });
    });

    it.each([
      ['null', null],
      ['empty', ''],
      ['whitespace', '   '],
      ['number', 123],
      ['object', {}],
      ['array', ['AA']],
      ['boolean', true],
    ])('rejects %s translated text for a non-empty source', (_label, text) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([{ id: '0', text }]),
        1,
        ['A'],
      );

      expect(result.contractViolation).toBe(true);
    });

    it.each([null, 0, 42, false, true])('rejects JSON_OBJECT top-level scalar %p', (value) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([value]),
        1,
        ['source'],
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result.contractViolation).toBe(true);
      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          violationCodes: expect.arrayContaining(['INVALID_TRANSLATED_TEXT']),
        }),
      ]);
    });

    it.each(['0', '42', 'false', 'true', 'null'])('accepts quoted JSON_OBJECT scalar %j', (value) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([value]),
        1,
        ['source'],
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result).toEqual({ results: [value], contractViolation: false });
    });

    it.each([null, 42, false])('rejects JSON_ARRAY scalar %p', (value) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([value]),
        1,
        ['source'],
        'TestProvider',
        ResponseFormat.JSON_ARRAY,
      );

      expect(result.contractViolation).toBe(true);
      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          violationCodes: expect.arrayContaining(['INVALID_TRANSLATED_TEXT']),
        }),
      ]);
    });

    it('rejects non-string text in the normal JSON_OBJECT wrapper', () => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [null] }),
        1,
        ['source'],
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result.contractViolation).toBe(true);
      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          violationCodes: expect.arrayContaining(['INVALID_TRANSLATED_TEXT']),
        }),
      ]);
    });

    it.each(['', '   '])('classifies JSON_OBJECT blank string %j as EMPTY_TRANSLATED_TEXT', (value) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([value]),
        1,
        ['source'],
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result.contractViolation).toBe(true);
      expect(result.invalidUnits).toEqual([
        expect.objectContaining({
          violationCodes: expect.arrayContaining(['EMPTY_TRANSLATED_TEXT']),
        }),
      ]);
      expect(result.invalidUnits[0].violationCodes).not.toContain('INVALID_TRANSLATED_TEXT');
    });

    it('accepts JSON_OBJECT identity string', () => {
      const result = AIResponseParser.parseBatchResult(
        '["URL"]',
        1,
        ['URL'],
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result).toEqual({ results: ['URL'], contractViolation: false });
    });

    it('preserves missing-result cardinality taxonomy', () => {
      const observeValidationResult = vi.fn();
      const originalBatch = [{ i: 'unit-0', t: 'source' }];
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify({ translations: [] }),
        1,
        originalBatch,
        'TestProvider',
        ResponseFormat.JSON_OBJECT,
        { observeValidationResult },
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result).toEqual(expect.objectContaining({
        results: [''],
        contractViolation: true,
      }));
      expect(result.invalidUnits).toEqual([]);
      expect(observeValidationResult).toHaveBeenCalledWith(expect.objectContaining({
        violations: expect.arrayContaining([
          expect.objectContaining({ code: 'CARDINALITY_MISMATCH' }),
          expect.objectContaining({ code: 'MISSING_REQUESTED_UNITS' }),
        ]),
      }));
    });

    it.each(['', '   '])('accepts %j output for a blank source', (text) => {
      const result = AIResponseParser.parseBatchResult(
        JSON.stringify([{ id: '0', text }]),
        1,
        [text],
      );

      expect(result).toEqual({ results: [''], contractViolation: false });
    });

    it('accepts a repaired response when its candidate is otherwise valid', () => {
      const result = AIResponseParser.parseBatchResult(
        "{'translations':[{'id':'0','text':'AA'}]}",
        1,
        ['A'],
        'WebAI',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result).toEqual({ results: ['AA'], contractViolation: false });
    });

    it('observes immutable validation without changing legacy output', () => {
      const originalBatch = [{ i: 'first', t: 'source' }];
      const observeValidationResult = vi.fn();
      const result = AIResponseParser.parseBatchResult(
        '[{"i":"first","t":"translated"}]',
        1,
        originalBatch,
        'Custom',
        ResponseFormat.JSON_ARRAY,
        { observeValidationResult },
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.results).toEqual(['translated']);
      expect(result.contractViolation).toBe(false);
      expect(observeValidationResult).toHaveBeenCalledTimes(1);
      expect(observeValidationResult).toHaveBeenCalledWith(expect.objectContaining({
        isValid: true,
        validatedUnits: [{ requestIndex: 0, unitId: 'first', translatedText: 'translated', violationCodes: [] }],
      }));
      expect(Object.isFrozen(observeValidationResult.mock.calls[0][0])).toBe(true);
    });

    it('observes invalid validation while filling resolved slots with empty string', () => {
      const originalBatch = [{ i: 'first', t: 'source one' }, { i: 'second', t: 'source two' }];
      const observeValidationResult = vi.fn();
      const result = AIResponseParser.parseBatchResult(
        '[{"i":"second","t":"translated"},{"i":"second","t":""}]',
        2,
        originalBatch,
        'Custom',
        ResponseFormat.JSON_ARRAY,
        { observeValidationResult },
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.results).toEqual(['', 'second']);
      expect(result.results).not.toContain('source one');
      expect(result.results).not.toContain('source two');
      expect(result.contractViolation).toBe(true);
      expect(observeValidationResult).toHaveBeenCalledWith(expect.objectContaining({ isValid: false }));
    });

    it('handles index-only invalid units in V3 contract violations', () => {
      const originalBatch = [{ i: 'g1', t: 'A@@TI_SEG_e1_s1_n2@@B' }];
      const validatorSpy = vi.spyOn(TranslationContractValidator, 'validate').mockReturnValue({
        isValid: false,
        violations: [{ code: 'V3_EMPTY_TRANSLATED_INTERVAL', index: 0 }],
        invalidUnits: [{ index: 0, requestedIndex: 0, responseId: 'g1' }],
        validatedUnits: [],
        missingUnitIds: [],
        duplicateUnitIds: [],
        unknownUnitIds: [],
        orderingFacts: null,
        cardinality: { expectedCount: 1, receivedCount: 1 },
        parserEvidence: null,
      });

      try {
        const result = AIResponseParser.parseBatchResult(
          '[{"i":"g1","t":"A@@TI_SEG_e1_s1_n2@@"}]',
          1,
          originalBatch,
          'WebAI',
          ResponseFormat.JSON_OBJECT,
          {},
          createManifestView(createRequestUnitManifest(originalBatch)),
        );

        expect(result).toMatchObject({ results: ['A@@TI_SEG_e1_s1_n2@@'], contractViolation: true });
        expect(result.invalidUnits).toEqual([expect.objectContaining({ requestIndex: null, responseId: 'g1' })]);
      } finally {
        validatorSpy.mockRestore();
      }
    });

    it('ignores observer failures without changing legacy output', () => {
      const originalBatch = ['source'];
      const result = AIResponseParser.parseBatchResult(
        '["translated"]',
        1,
        originalBatch,
        'Custom',
        ResponseFormat.JSON_ARRAY,
        { observeValidationResult: () => { throw new Error('ignore'); } },
        createManifestView(createRequestUnitManifest(originalBatch)),
      );

      expect(result.results).toEqual(['translated']);
      expect(result.contractViolation).toBe(false);
    });

    it('does not observe malformed parser fallback', () => {
      const observeValidationResult = vi.fn();
      const result = AIResponseParser.parseBatchResult(
        '{"translations":',
        1,
        ['source'],
        'Custom',
        ResponseFormat.JSON_OBJECT,
        { observeValidationResult },
        createManifestView(createRequestUnitManifest(['source'])),
      );

      expect(result.results).toEqual(['']);
      expect(result.contractViolation).toBe(true);
      expect(result.parseFailed).toBe(true);
      expect(observeValidationResult).not.toHaveBeenCalled();
    });

    it('total JSON parse failure fills all slots with empty string, not source', () => {
      const result = AIResponseParser.parseBatchResult(
        '{"translations":',
        3,
        ['A', 'B', 'C'],
        'Custom',
        ResponseFormat.JSON_OBJECT,
      );

      expect(result.results).toEqual(['', '', '']);
      expect(result.results).not.toContain('A');
      expect(result.results).not.toContain('B');
      expect(result.results).not.toContain('C');
      expect(result.contractViolation).toBe(true);
      expect(result.parseFailed).toBe(true);
    });

    it('does not observe split batches without a manifest view', () => {
      const observeValidationResult = vi.fn();
      const result = AIResponseParser.parseBatchResult(
        '["translated"]',
        1,
        ['source'],
        'Custom',
        ResponseFormat.JSON_ARRAY,
        { observeValidationResult },
        null,
      );

      expect(result.results).toEqual(['translated']);
      expect(result.contractViolation).toBe(false);
      expect(observeValidationResult).not.toHaveBeenCalled();
    });

    it('skips observation for an inconsistent manifest view without changing parser output', () => {
      const validate = vi.spyOn(TranslationContractValidator, 'validate');

      const result = AIResponseParser.parseBatchResult(
        '["translated"]',
        1,
        ['source'],
        'Custom',
        ResponseFormat.JSON_ARRAY,
        null,
        {
          units: [{ unitId: 'unit-0', requestIndex: 0 }],
          declaredMappingStrategy: MappingStrategy.POSITIONAL_ONLY,
        },
      );

      expect(result.results).toEqual(['translated']);
      expect(result.contractViolation).toBe(false);
      expect(validate).not.toHaveBeenCalled();
      validate.mockRestore();
    });

    it('fills an unresolved slot with empty string when a duplicate response ID masks a missing slot', () => {
      const response = '[{"i":"n1","t":"TA"},{"i":"n1","t":"TB"}]';
      const result = AIResponseParser.parseBatchResult(
        response,
        2,
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }],
        'TestProvider',
        ResponseFormat.JSON_ARRAY,
      );

      expect(result.results[1]).toBe('');
      expect(result.results).not.toContain('A');
      expect(result.results).not.toContain('B');
      expect(result.contractViolation).toBe(true);
    });

    it('fills unresolved slots with empty string when response items are missing', () => {
      const response = '[{"i":"n1","t":"TA"}]';
      const result = AIResponseParser.parseBatchResult(
        response,
        3,
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }, { i: 'n3', t: 'C' }],
        'TestProvider',
        ResponseFormat.JSON_ARRAY,
      );

      expect(result.results).toEqual(['TA', '', '']);
      expect(result.results).not.toContain('A');
      expect(result.results).not.toContain('B');
      expect(result.results).not.toContain('C');
      expect(result.contractViolation).toBe(true);
    });

    it('preserves valid mapped translations unchanged', () => {
      const response = '[{"i":"n1","t":"TA"},{"i":"n2","t":"TB"}]';
      const result = AIResponseParser.parseBatchResult(
        response,
        2,
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }],
        'TestProvider',
        ResponseFormat.JSON_ARRAY,
      );

      expect(result.results).toEqual(['TA', 'TB']);
      expect(result.contractViolation).toBe(false);
    });

    it('accepts source-equal translation as valid', () => {
      const response = '[{"i":"n1","t":"A"},{"i":"n2","t":"B"}]';
      const result = AIResponseParser.parseBatchResult(
        response,
        2,
        [{ i: 'n1', t: 'A' }, { i: 'n2', t: 'B' }],
        'TestProvider',
        ResponseFormat.JSON_ARRAY,
      );

      expect(result.results).toEqual(['A', 'B']);
      expect(result.contractViolation).toBe(false);
    });
  });

  describe('completion correlation (ADR-016 P3)', () => {
    const sourceBatch = [{ i: 'first', t: 'source' }];

    it('attaches the correlated completion to parser and validation facts', () => {
      const operation = createTranslationOperation('p3-correlate');
      const observeValidationResult = vi.fn();
      const completion = createCompletionRecord({
        provider: 'Gemini',
        termination: CompletionTermination.NORMAL,
        responseId: 'resp-1',
      });

      const result = AIResponseParser.parseBatchResult(
        '[{"i":"first","t":"translated"}]',
        1,
        sourceBatch,
        'Gemini',
        ResponseFormat.JSON_ARRAY,
        { operation, observeValidationResult },
        createManifestView(createRequestUnitManifest(sourceBatch)),
        completion,
      );

      expect(result.results).toEqual(['translated']);
      expect(result.contractViolation).toBe(false);
      const validationResult = observeValidationResult.mock.calls[0][0];
      expect(validationResult.parserEvidence.completion).toBe(completion);
    });

    it('keeps an absent completion distinct from an explicit UNKNOWN record', () => {
      const operation = createTranslationOperation('p3-absent');
      const observeValidationResult = vi.fn();

      const result = AIResponseParser.parseBatchResult(
        '[{"i":"first","t":"translated"}]',
        1,
        sourceBatch,
        'WebAI',
        ResponseFormat.JSON_ARRAY,
        { operation, observeValidationResult },
        createManifestView(createRequestUnitManifest(sourceBatch)),
        null,
      );

      expect(result.results).toEqual(['translated']);
      const validationResult = observeValidationResult.mock.calls[0][0];
      expect(validationResult.parserEvidence).not.toHaveProperty('completion');
    });

    it('never branches parser behavior on termination value', () => {
      const operation = createTranslationOperation('p3-nobranch');

      const truncated = AIResponseParser.parseBatchResult(
        '[{"i":"first","t":"partial"}]',
        1,
        sourceBatch,
        'Gemini',
        ResponseFormat.JSON_ARRAY,
        { operation },
        createManifestView(createRequestUnitManifest(sourceBatch)),
        createCompletionRecord({ provider: 'Gemini', termination: CompletionTermination.TRUNCATED, responseId: 'resp-1' }),
      );
      const normal = AIResponseParser.parseBatchResult(
        '[{"i":"first","t":"partial"}]',
        1,
        sourceBatch,
        'Gemini',
        ResponseFormat.JSON_ARRAY,
        { operation },
        createManifestView(createRequestUnitManifest(sourceBatch)),
        createCompletionRecord({ provider: 'Gemini', termination: CompletionTermination.NORMAL, responseId: 'resp-2' }),
      );

      expect(truncated).toEqual(normal);
    });
  });
});
