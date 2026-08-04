import { describe, it, expect, vi } from 'vitest';
import { AIResponseParser } from './AIResponseParser.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';
import { TranslationContractValidator } from '@/features/translation/core/TranslationContractValidator.js';
import { createManifestView, createRequestUnitManifest, MappingStrategy } from '@/features/translation/ir/RequestUnitManifest.js';
import { createTranslationOperation } from '@/features/translation/ir/TranslationOperation.js';

describe('AIResponseParser', () => {
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

    it('maps numeric response IDs positionally for plain-string batches', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":0,"text":"AA"},{"id":1,"text":"BB"},{"id":2,"text":"CC"}]',
        3,
        ['A', 'B', 'C'],
      );

      expect(result).toEqual({ results: ['AA', 'BB', 'CC'], contractViolation: false });
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

    it('rejects duplicate mappings even when every requested slot is filled', () => {
      const result = AIResponseParser.parseBatchResult(
        '[{"id":"0","text":"first"},{"id":"0","text":"replacement"},{"id":"1","text":"second"}]',
        2,
        ['A', 'B'],
      );

      expect(result.contractViolation).toBe(true);
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

    it('observes invalid validation while preserving legacy fallback mapping', () => {
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

      expect(result.results).toEqual(['source one', 'second']);
      expect(result.contractViolation).toBe(true);
      expect(observeValidationResult).toHaveBeenCalledWith(expect.objectContaining({ isValid: false }));
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

      expect(result.results).toEqual(['source']);
      expect(result.contractViolation).toBe(true);
      expect(observeValidationResult).not.toHaveBeenCalled();
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
  });
});
