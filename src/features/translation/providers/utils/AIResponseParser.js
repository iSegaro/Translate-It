/**
 * AI Response Parser - Centralized helper to clean and parse AI responses
 * Handles markdown JSON blocks, artifacts, and multi-format JSON structures
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIResponseParser');

export const AIResponseParser = {
  /**
   * Centralized helper to clean AI responses from common artifacts
   * Handles markdown JSON blocks and accidental single-segment arrays
   * @param {string} result - Raw text from AI
   * @returns {string} Cleaned text
   */
  cleanAIResponse(result) {
    if (!result || typeof result !== 'string') return result;

    let processedResult = result;
    let jsonString = null;

    // 1. Try to find JSON in markdown code blocks
    const markdownMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
      jsonString = markdownMatch[1].trim();
    } else {
      // 2. Try to find direct JSON structure
      const bracketIndex = result.indexOf('[');
      const braceIndex = result.indexOf('{');
      const start = (bracketIndex !== -1 && (braceIndex === -1 || bracketIndex < braceIndex)) ? bracketIndex : braceIndex;
      
      if (start !== -1) {
        const lastBracket = result.lastIndexOf(']');
        const lastBrace = result.lastIndexOf('}');
        const end = Math.max(lastBracket, lastBrace);
        
        if (end > start) {
          jsonString = result.substring(start, end + 1);
        }
      }
    }

    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        
        // Handle single segment JSON array: ["text"]
        if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
          processedResult = parsed[0];
        } 
        // Handle Select Element JSON format: {"translations": [{"text": "..."}]} or [{"text": "..."}]
        else if (typeof parsed === 'object' && parsed !== null) {
          let items = Array.isArray(parsed) ? parsed : (parsed.translations || Object.values(parsed));
          if (Array.isArray(items) && items.length === 1) {
            const first = items[0];
            processedResult = typeof first === 'object' ? (first.t || first.text || first.translation || processedResult) : first;
          }
        }
      } catch {
        // Not valid JSON, keep original
      }
    }

    return processedResult;
  },

  /**
   * Parse batch translation results from JSON response
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @param {string} providerName - Provider name for logging
   * @returns {string[]} - Parsed results
   */
  parseBatchResult(result, expectedCount, originalBatch, providerName = 'Unknown') {
    if (!result || typeof result !== 'string') return originalBatch;

    try {
      let jsonString = result.trim();
      let parsed = null;

      // 1. Multi-stage JSON Extraction
      try {
        // Handle raw JSON (common for large responses where AI skips markers)
        parsed = JSON.parse(jsonString);
      } catch {
        // Handle Markdown blocks
        const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          try { 
            const cleaned = codeBlockMatch[1].replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            parsed = JSON.parse(cleaned); 
          } catch { /* next */ }
        }
        
        if (!parsed) {
          // Manual boundary search
          const firstBracket = jsonString.indexOf('[');
          const firstBrace = jsonString.indexOf('{');
          const start = (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) ? firstBracket : firstBrace;
          
          if (start !== -1) {
            const lastBracket = jsonString.lastIndexOf(']');
            const lastBrace = jsonString.lastIndexOf('}');
            const end = Math.max(lastBracket, lastBrace);
            
            if (end > start) {
              try { 
                const candidate = jsonString.substring(start, end + 1).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
                parsed = JSON.parse(candidate); 
              } catch { /* fail */ }
            }
          }
        }
      }

      if (!parsed) throw new Error('No valid JSON found');

      // 2. Normalize parsed data into a flat array
      let rawItems = [];
      if (Array.isArray(parsed)) {
        rawItems = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.translations)) rawItems = parsed.translations;
        else rawItems = Object.values(parsed);
      }

      // 3. Map by ID or fill results array
      const results = new Array(expectedCount).fill(null);
      const unmappedTexts = [];

      rawItems.forEach((item) => {
        const text = typeof item === 'object' && item !== null ? (item.t || item.text || item.translation || '') : String(item);
        const id = (typeof item === 'object' && item !== null && (item.i !== undefined || item.id !== undefined)) ? (item.i || item.id) : null;

        if (id !== null) {
          // If id is UID (string), find its index in original batch
          const idx = typeof id === 'string' 
            ? originalBatch.findIndex(ob => (typeof ob === 'object' ? (ob.i || ob.uid) : null) === id)
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

      // 4. Fill gaps
      let unmappedIdx = 0;
      for (let i = 0; i < expectedCount; i++) {
        if (results[i] === null) {
          results[i] = unmappedTexts[unmappedIdx] || (typeof originalBatch[i] === 'object' ? (originalBatch[i].t || originalBatch[i].text) : originalBatch[i]) || '';
          unmappedIdx++;
        }
      }

      return results;
    } catch (error) {
      logger.warn(`[${providerName}] Failed to parse batch result: ${error.message}. Falling back to lines.`);
      logger.debug(`[${providerName}] Raw response snippet: ${result.substring(0, 500)}...`);
      return this.fallbackParsing(result, expectedCount, originalBatch);
    }
  },

  /**
   * Fallback parsing when JSON parsing fails
   * @param {string} result - API response
   * @param {number} expectedCount - Expected number of results
   * @param {string[]} originalBatch - Original texts for fallback
   * @returns {string[]} - Parsed results or original texts
   */
  fallbackParsing(result, expectedCount, originalBatch) {
    // A simple fallback: split the result by newlines.
    // Preserve empty lines to maintain formatting for AI responses
    const lines = result.split('\\n');
    
    // Filter out completely empty lines only if we have too many lines
    if (lines.length > expectedCount) {
      const nonEmptyLines = lines.filter(line => line.trim() !== '');
      if (nonEmptyLines.length === expectedCount) {
        return nonEmptyLines;
      }
    }
    
    // If line count matches, return as-is (preserving formatting)
    if (lines.length === expectedCount) {
      return lines;
    }
    
    // If all else fails, return the original texts for this batch
    return originalBatch.map(item => typeof item === 'object' ? (item.t || item.text) : item);
  }
};
