import { describe, it, expect } from 'vitest';
import { AIResponseParser } from './AIResponseParser.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';

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
  });
});
