/**
 * AI Response Parser - Strict Contract-Based Parser
 * Handles markdown cleaning and JSON extraction based on explicit ResponseFormat contracts.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIResponseParser');

export const AIResponseParser = {
  /**
   * Cleans AI responses based on the expected contract.
   * @param {string} result - Raw text from AI
   * @param {string} expectedFormat - ResponseFormat enum value
   * @returns {any} Cleaned text or parsed object/array
   */
  cleanAIResponse(result, expectedFormat = ResponseFormat.STRING) {
    if (!result || typeof result !== 'string') return result;

    // Standard cleanup for all AI responses (invisible characters)
    let processedResult = result.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

    // Strategy 1: Plain Text (STRING)
    // We NEVER attempt JSON parsing for plain strings to avoid corruption of text like "[Hello]"
    if (expectedFormat === ResponseFormat.STRING) {
      return this._stripMarkdown(processedResult);
    }

    // Strategy 2: Structured Data (JSON_ARRAY, JSON_OBJECT)
    const parsed = this._extractAndParseJson(processedResult, expectedFormat);

    // Dynamic Format Bridge: AI often returns Array when Object was requested, and vice-versa.
    // We intelligently convert them if they match the content.
    if (expectedFormat === ResponseFormat.JSON_OBJECT && Array.isArray(parsed)) {
      // Convert Array [translated_text1, ...] to Object {"1": "translated_text1", ...}
      const bridged = {};
      parsed.forEach((val, idx) => {
        const text = (typeof val === 'object' && val !== null) ? (val.t || val.text || val.translation || '') : String(val);
        bridged[idx + 1] = text;
      });
      return bridged;
    }

    return parsed;
  },

  /**
   * Parse batch translation results from JSON response.
   * Now strictly follows the JSON contract without risky line-splitting fallbacks.
   */
  parseBatchResult(result, expectedCount, originalBatch, providerName = 'Unknown', expectedFormat = ResponseFormat.JSON_ARRAY) {
    try {
      const parsed = this.cleanAIResponse(result, expectedFormat);
      
      if (!parsed) throw new Error('Empty or invalid response');

      // Normalize parsed data into a flat array
      let rawItems = [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        // Handle {"translations": [...]} or similar wrappers
        rawItems = parsed.translations || parsed.results || Object.values(parsed).find(v => Array.isArray(v)) || Object.values(parsed);
      }

      if (!Array.isArray(rawItems)) {
        throw new Error('Response is not an array');
      }

      // Map results back to the original indices
      const results = new Array(expectedCount).fill(null);
      const unmappedTexts = [];

      rawItems.forEach((item) => {
        const text = (typeof item === 'object' && item !== null) ? (item.t || item.text || item.translation || '') : String(item);
        const id = (typeof item === 'object' && item !== null && (item.i !== undefined || item.id !== undefined)) ? (item.i || item.id) : null;

        if (id !== null) {
          const idx = typeof id === 'string' 
            ? originalBatch.findIndex(ob => (typeof ob === 'object' ? (ob.i || ob.uid || ob.id) : null) === id)
            : parseInt(id, 10);
            
          if (idx !== -1 && idx >= 0 && idx < expectedCount) {
            results[idx] = text;
          } else {
            unmappedTexts.push(text);
          }
        } else {
          unmappedTexts.push(text);
        }
      });

      // Fill gaps sequentially with remaining texts
      let unmappedIdx = 0;
      for (let i = 0; i < expectedCount; i++) {
        if (results[i] === null) {
          results[i] = unmappedTexts[unmappedIdx] || (typeof originalBatch[i] === 'object' ? (originalBatch[i].t || originalBatch[i].text) : originalBatch[i]) || '';
          unmappedIdx++;
        }
      }

      return results;
    } catch (error) {
      logger.error(`[${providerName}] Strict parse failed: ${error.message}`);
      // Fallback: return original texts but do NOT split by \n as it's unreliable
      return originalBatch.map(item => typeof item === 'object' ? (item.t || item.text) : item);
    }
  },

  /**
   * Strips markdown code blocks if present, returning the inner content.
   * @private
   */
  _stripMarkdown(text) {
    const markdownMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      return markdownMatch[1].trim();
    }
    return text;
  },

  /**
   * Attempts to extract and parse JSON from the response.
   * @private
   */
  _extractAndParseJson(text, expectedFormat) {
    let jsonString = text.trim();

    // 1. Try direct parsing
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // 2. Try markdown extraction
      const cleanedFromMarkdown = this._stripMarkdown(jsonString);
      if (cleanedFromMarkdown !== jsonString) {
        try { return JSON.parse(cleanedFromMarkdown); } catch (e2) {}
      }

      // 3. Robust Boundary Search
      const firstBracket = jsonString.indexOf('[');
      const firstBrace = jsonString.indexOf('{');
      const start = (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) ? firstBracket : firstBrace;
      
      if (start !== -1) {
        const lastBracket = jsonString.lastIndexOf(']');
        const lastBrace = jsonString.lastIndexOf('}');
        const end = Math.max(lastBracket, lastBrace);
        
        if (end > start) {
          try {
            const candidate = jsonString.substring(start, end + 1);
            return JSON.parse(candidate);
          } catch (e3) {}
        }
      }
    }

    // Final Fallback: If AI returns plain text but we expected structured data
    // This happens often with single-segment batches where AI ignores JSON instructions
    if (!jsonString.includes('{') && !jsonString.includes('[')) {
      const cleanText = this._stripMarkdown(jsonString);
      if (expectedFormat === ResponseFormat.JSON_OBJECT) {
        return { translations: [{ text: cleanText }] };
      }
      if (expectedFormat === ResponseFormat.JSON_ARRAY) {
        return [cleanText];
      }
    }

    throw new Error(`Failed to parse response as ${expectedFormat}`);
  }
};
