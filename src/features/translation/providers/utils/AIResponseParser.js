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

    // 1. SMART UNESCAPE: Handle AI models (like Llama/Cerebras) that fail UTF-8 
    // and return escaped Unicode or even triple-escaped sequences.
    // We do this BEFORE any parsing to ensure values inside JSON objects are fixed.
    if (processedResult.includes('\\\\u') || processedResult.includes('\\u')) {
      try {
        // Fix non-standard 6-digit/double-escaped escapes like \\u000648 -> \u0648
        processedResult = processedResult.replace(/\\\\u000([0-9a-fA-F]{3})/g, '\\u$1');
        processedResult = processedResult.replace(/\\u000([0-9a-fA-F]{3})/g, '\\u$1');
        
        // Unescape standard Unicode sequences (both \u0648 and \\u0648)
        processedResult = processedResult.replace(/(?:\\\\|\\)u([0-9a-fA-F]{4})/g, (match, grp) => {
          try {
            return String.fromCharCode(parseInt(grp, 16));
          } catch (e) { return match; }
        });
        
        // Strip remaining dangerous control characters (00-1F) except common ones
        processedResult = processedResult.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '');
      } catch (e) {
        console.warn('[AIResponseParser] Unicode decoding failed:', e);
      }
    }

    // 2. PRE-PROCESS: Fix a very specific hallucination where AI repeats "text" key with empty value
    // Example: {"id":"1", "text":"Actual Translation", "text":""}
    if (processedResult.includes('"text":""') || processedResult.includes('"text": ""')) {
      processedResult = processedResult.replace(/("text"\s*:\s*"[^"]*")\s*,\s*"text"\s*:\s*""/g, '$1');
      processedResult = processedResult.replace(/"text"\s*:\s*""\s*,\s*("text"\s*:\s*"[^"]*")/g, '$1');
    }

    // Strategy 1: Plain Text (STRING)
    // We NEVER attempt JSON parsing for plain strings to avoid corruption of text like "[Hello]"
    if (expectedFormat === ResponseFormat.STRING) {
      return this._stripMarkdown(processedResult);
    }

    // Strategy 2: Structured Data (JSON_ARRAY, JSON_OBJECT)
    let parsed = this._extractAndParseJson(processedResult, expectedFormat);

    // Dynamic Format Bridge: Handle multi-encoded or escaped JSON strings (Deep recursion)
    // AI sometimes returns stringified JSON nested inside another JSON or escaped multiple times.
    let depth = 0;
    while (typeof parsed === 'string' && depth < 3) {
      let candidate = parsed.trim();

      // Remove possible surrounding quotes if the whole thing is double-quoted
      if (candidate.startsWith('"') && candidate.endsWith('"') && candidate.length > 2) {
        candidate = candidate.substring(1, candidate.length - 1);
      }

      // Check if it looks like JSON or escaped JSON
      if ((candidate.includes('{') || candidate.includes('['))) {
        try {
          // Attempt to unescape common multiple backslashes (e.g. \\\" -> \")
          const unescaped = candidate.replace(/\\\\\\"/g, '"').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          const nextParse = this._extractAndParseJson(unescaped, expectedFormat);
          if (nextParse && (typeof nextParse === 'object' || Array.isArray(nextParse))) {
            parsed = nextParse;
            depth++;
            continue; // Try one more level if needed
          }
        } catch (e) {}
      }
      break; // Not JSON or couldn't be parsed further
    }

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
        let potentialItems = parsed.translations || parsed.results || Object.values(parsed).find(v => Array.isArray(v));
        
        // CRITICAL FIX: If translations is a STRING (double encoding), try to parse it
        if (typeof potentialItems === 'string') {
          try {
            potentialItems = JSON.parse(potentialItems);
          } catch (e) {
            // Try to repair common AI malformed JSON (e.g. single quotes used incorrectly)
            try {
              const repaired = potentialItems.replace(/'/g, '"').replace(/\\"/g, '"');
              potentialItems = JSON.parse(repaired);
            } catch (e2) {}
          }
        }
        
        rawItems = Array.isArray(potentialItems) ? potentialItems : Object.values(parsed);
      }

      if (!Array.isArray(rawItems)) {
        // Final attempt: if we have a single object that isn't an array, wrap it
        rawItems = [parsed];
      }

      // Map results back to the original indices
      const results = new Array(expectedCount).fill(null);
      const unmappedTexts = [];

      rawItems.forEach((item) => {
        let text = '';
        let id = null;

        if (typeof item === 'object' && item !== null) {
          // 1. Extract ID
          id = item.i !== undefined ? item.i : (item.id !== undefined ? item.id : null);
          
          // 2. Extract Text (robust)
          text = item.t || item.text || item.translation || '';
          
          // CRITICAL FIX: If text is empty but ID is an object (common AI hallucination),
          // the translation might be INSIDE the ID object.
          if (!text && typeof id === 'object' && id !== null) {
            const keys = Object.keys(id);
            if (keys.length > 0) {
              text = id[keys[0]]; // Take the first value inside the ID object
              id = keys[0];       // Take the key as the real ID
            }
          }
          
          // If still no text, check if any other field contains a string longer than ID
          // and doesn't look like a technical key
          if (!text) {
            const values = Object.values(item).filter(v => typeof v === 'string' && v.length > 2);
            if (values.length > 0) {
              // Exclude values that look like UUIDs or IDs
              const candidates = values.filter(v => !/^[a-z0-9-]{10,}$/i.test(v));
              text = candidates.length > 0 ? candidates.sort((a, b) => b.length - a.length)[0] : values[0];
            }
          }
        } else {
          text = String(item);
        }

        // Final check for text: if it's still a JSON string, try to parse it one more time
        if (typeof text === 'string' && (text.startsWith('{') || text.startsWith('['))) {
          try {
            const innerParsed = JSON.parse(text);
            if (typeof innerParsed === 'object') {
              text = innerParsed.t || innerParsed.text || innerParsed.translation || Object.values(innerParsed)[0] || text;
            }
          } catch (e) {}
        }

        if (id !== null && id !== undefined) {
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
    if (!text || typeof text !== 'string') return null;
    let jsonString = text.trim();

    // SANITY CHECK: Detect repetitive 'garbage' output (common in failing free models)
    // If the string contains the same short pattern repeated many times
    if (jsonString.length > 100) {
      const sample = jsonString.substring(0, 50);
      const occurrences = (jsonString.match(new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      if (occurrences > 5) {
        throw new Error("AI returned repetitive garbage output");
      }
    }

    // 1. Direct parsing
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      // Try repairing truncated JSON if it looks incomplete
      try {
        return JSON.parse(this._repairTruncatedJson(jsonString));
      } catch (eRep) {}
    }

    // 2. Try markdown extraction
    const cleanedFromMarkdown = this._stripMarkdown(jsonString);
    if (cleanedFromMarkdown !== jsonString) {
      try { return JSON.parse(cleanedFromMarkdown); } catch (e2) {
        try {
          const repaired = cleanedFromMarkdown.replace(/'/g, '"');
          return JSON.parse(repaired);
        } catch (e2b) {
          // Try repairing truncated content inside markdown
          try {
            return JSON.parse(this._repairTruncatedJson(cleanedFromMarkdown));
          } catch (e2c) {}
        }
      }
    }

    // 3. Robust Boundary Search
    const firstBracket = jsonString.indexOf('[');
    const firstBrace = jsonString.indexOf('{');
    
    let searchIndices = [];
    if (firstBracket !== -1) searchIndices.push(firstBracket);
    if (firstBrace !== -1) searchIndices.push(firstBrace);
    searchIndices.sort((a, b) => a - b);

    for (const start of searchIndices) {
      const isArray = jsonString[start] === '[';
      const lastToken = isArray ? ']' : '}';
      const lastIndex = jsonString.lastIndexOf(lastToken);
      
      // Case A: Found matching closing token
      if (lastIndex > start) {
        const candidate = jsonString.substring(start, lastIndex + 1);
        try {
          return JSON.parse(candidate);
        } catch (e3) {
          try {
            return JSON.parse(candidate.replace(/'/g, '"'));
          } catch (e3b) {}
        }
      } 
      // Case B: No closing token, but starts like JSON (Truncated)
      else if (lastIndex === -1 || lastIndex < start) {
        try {
          const candidate = jsonString.substring(start);
          return JSON.parse(this._repairTruncatedJson(candidate));
        } catch (e4) {}
      }
    }

    // Final Fallback...


    // Final Fallback: If AI returns plain text but we expected structured data
    // This happens often with single-segment batches where AI ignores JSON instructions
    const cleanText = this._stripMarkdown(jsonString);
    
    // SAFETY CHECK: If the clean text still looks like JSON but we reached this fallback,
    // it means it's likely a malformed/truncated JSON. We should NOT return it as plain text.
    if ((cleanText.startsWith('{') || cleanText.startsWith('[')) && 
        (cleanText.includes('":') || cleanText.includes('",'))) {
      throw new Error(`AI returned malformed JSON that couldn't be parsed as ${expectedFormat}`);
    }

    if (expectedFormat === ResponseFormat.JSON_OBJECT) {
      return { translations: [{ text: cleanText }] };
    }
    if (expectedFormat === ResponseFormat.JSON_ARRAY) {
      return [cleanText];
    }

    throw new Error(`Failed to parse response as ${expectedFormat}`);
  },

  /**
   * Attempts to repair a truncated JSON string by closing unclosed structures.
   * @private
   */
  _repairTruncatedJson(json) {
    if (!json || typeof json !== 'string') return json;

    let repaired = json.trim();

    // 0. Initial cleanup: Handle AI using single quotes for 'translations' key incorrectly
    // This was specifically seen in the Call #1 logs: "translations':[
    repaired = repaired.replace(/translations'\s*:/g, '"translations":');

    // 1. Remove trailing comma if present
    repaired = repaired.replace(/,\s*$/, '');

    // 1b. Safety: If ends with a single backslash, remove it as it's likely a broken escape
    if (repaired.endsWith('\\')) {
      repaired = repaired.substring(0, repaired.length - 1);
    }

    // 2. Count open vs closed structures
    const openBraces = (repaired.match(/\{/g) || []).length;
    const closedBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closedBrackets = (repaired.match(/\]/g) || []).length;

    // 3. Handle unclosed strings (very common in truncation)
    const quoteCount = (repaired.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // 4. Close objects and arrays
    for (let i = 0; i < (openBraces - closedBraces); i++) {
      repaired += '}';
    }
    for (let i = 0; i < (openBrackets - closedBrackets); i++) {
      repaired += ']';
    }

    // Double check trailing comma after adding quotes
    repaired = repaired.replace(/,\s*([\]\}])/g, '$1');

    return repaired;
  }
};
