/**
 * AI Response Parser - Strict Contract-Based Parser
 * Handles markdown cleaning and JSON extraction based on explicit ResponseFormat contracts.
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ResponseFormat } from '@/shared/config/translationConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.TRANSLATION, 'AIResponseParser');

/**
 * Pipeline-based AI Response Healers.
 * Each healer is a focused function that fixes a specific AI output issue.
 */
const Healers = {
  /**
   * Pre-processing Pipeline: Fixes the raw string before any parsing attempt.
   */
  PreProcessors: [
    // 1. Basic Cleanup - Keep ZWNJ (\u200C) for Persian support
    (text) => text.replace(/\u200B|\u200D|\uFEFF/g, '').trim(),

    // 2. SMART UNESCAPE: Handle multiple levels of escaping
    // ONLY intended for raw string responses, not JSON strings before parsing
    (text) => {
      // Logic moved to be format-sensitive in cleanAIResponse
      return text;
    },

    // 3. QUOTE HEALER: Fix AI using single quotes for JSON keys or values
    // This is common in weak models: {'id': '0'} -> {"id": "0"}
    (text) => {
      if (!text.includes("'") && !text.includes('translations')) return text;
      let processed = text;
      // Fix keys: 'id': -> "id":
      processed = processed.replace(/'(\w+)'\s*:/g, '"$1":');
      // Fix specific common key: translations':[ -> "translations":[
      processed = processed.replace(/translations'\s*:\s*\[/g, '"translations":[');
      // Fix values: : 'value' -> : "value" (careful with Persian text containing apostrophes)
      // We only target single quotes that are preceded by : and followed by , or } or ]
      processed = processed.replace(/:\s*'([^']*)'\s*([,}\]])/g, ': "$1"$2');
      return processed;
    },

    // 4. DUPLICATE KEY HEALER: Fix AI repeating "text" key with empty value
    (text) => {
      if (!text.includes('"text":""') && !text.includes('"text": ""')) return text;
      let processed = text;
      processed = processed.replace(/("text"\s*:\s*"[^"]*")\s*,\s*"text"\s*:\s*""/g, '$1');
      return processed.replace(/"text"\s*:\s*""\s*,\s*("text"\s*:\s*"[^"]*")/g, '$1');
    }
  ],

  /**
   * Post-processing Pipeline: Fixes the parsed object or handles deep encoding.
   */
  PostProcessors: {
    /**
     * Handles recursive unescaping of multi-encoded JSON strings.
     */
    deepUnescape(parsed, expectedFormat, parseFn) {
      let depth = 0;
      let current = parsed;
      while (typeof current === 'string' && depth < 3) {
        let candidate = current.trim();

        if (candidate.startsWith('"') && candidate.endsWith('"') && candidate.length > 2) {
          candidate = candidate.substring(1, candidate.length - 1);
        }

        if (candidate.includes('{') || candidate.includes('[')) {
          try {
            const unescaped = candidate.replace(/\\\\\\"/g, '"').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            const nextParse = parseFn(unescaped, expectedFormat);
            if (nextParse && (typeof nextParse === 'object' || Array.isArray(nextParse))) {
              current = nextParse;
              depth++;
              continue;
            }
          } catch { /* ignore */ }
        }
        break;
      }
      return current;
    },

    /**
     * Bridges Array responses to the requested Object format.
     */
    formatBridge(parsed, expectedFormat) {
      if (expectedFormat === ResponseFormat.JSON_OBJECT && Array.isArray(parsed)) {
        const bridged = {};
        parsed.forEach((val, idx) => {
          const text = (typeof val === 'object' && val !== null) 
            ? (val.t || val.text || val.translation || '') 
            : String(val);
          bridged[idx + 1] = text;
        });
        return bridged;
      }
      return parsed;
    }
  }
};

export const AIResponseParser = {
  /**
   * Cleans AI responses based on the expected contract.
   */
  cleanAIResponse(result, expectedFormat = ResponseFormat.STRING) {
    if (!result || typeof result !== 'string') return result;

    // Strategy 1: RAW STRING (Popup, Sidepanel, Field)
    if (expectedFormat === ResponseFormat.STRING) {
      // For raw strings, we apply the full pipeline including unescaping
      let processed = Healers.PreProcessors.reduce((text, healer) => healer(text), result);
      processed = this._unescapeRawString(processed);
      
      const stripped = this._stripMarkdown(processed);
      // Fallback: If AI returned JSON even though we asked for STRING
      if (stripped.startsWith('{') || stripped.startsWith('[')) {
        try {
          const parsed = JSON.parse(stripped);
          const items = this._normalizeToItems(parsed);
          if (items && items.length > 0) {
            const firstItem = items[0];
            const { text } = this._extractItemData(firstItem);
            if (text) return text;
          }
        } catch { /* ignore and return stripped */ }
      }
      return stripped;
    }

    // Strategy 2: Structured Data (JSON_ARRAY, JSON_OBJECT)
    // CRITICAL: We skip PreProcessors like unescape/cleanup for JSON to prevent structure corruption.
    // We only use the JSON-specific healers if parsing fails.
    let processedResult = result;
    let parsed = this._extractAndParseJson(processedResult, expectedFormat);

    // Execute Post-processing Pipeline
    if (parsed) {
      parsed = Healers.PostProcessors.deepUnescape(parsed, expectedFormat, this._extractAndParseJson.bind(this));
      parsed = Healers.PostProcessors.formatBridge(parsed, expectedFormat);
    }

    return parsed;
  },

  /**
   * Manual unescape for raw strings (Internal)
   * @private
   */
  _unescapeRawString(text) {
    if (!text || !text.includes('\\u')) return text;
    try {
      let processed = text;
      // Fix non-standard 6-digit/double-escaped escapes like \\u000648 -> \u0648
      processed = processed.replace(/(?:\\\\|\\)u000([0-9a-fA-F]{3,4})/g, '\\u$1');
      
      // Unescape standard Unicode sequences (both \u0648 and \\u0648)
      processed = processed.replace(/(?:\\\\|\\)u([0-9a-fA-F]{4})/g, (match, grp) => {
        try {
          return String.fromCharCode(parseInt(grp, 16));
        } catch { return match; }
      });
      
      // Strip remaining dangerous control characters (00-1F) except common ones
      const lowRange = '\\x00-\\x08';
      const midRange = '\\x0B-\\x0C';
      const highRange = '\\x0E-\\x1F';
      const controlPattern = new RegExp(`[${lowRange}${midRange}${highRange}]`, 'g');
      return processed.replace(controlPattern, '');
    } catch { return text; }
  },

  /**
   * Parse batch translation results from JSON response.
   */
  parseBatchResult(result, expectedCount, originalBatch, providerName = 'Unknown', expectedFormat = ResponseFormat.JSON_ARRAY) {
    try {
      const parsed = this.cleanAIResponse(result, expectedFormat);
      
      if (!parsed) throw new Error('Empty or invalid response');

      let rawItems = this._normalizeToItems(parsed);
      const results = new Array(expectedCount).fill(null);
      const unmappedTexts = [];

      rawItems.forEach((item) => {
        const { text, id } = this._extractItemData(item);
        if (id !== null && id !== undefined) {
          const idx = this._findOriginalIndex(id, originalBatch, expectedCount);
          if (idx !== -1) {
            results[idx] = text;
          } else {
            unmappedTexts.push(text);
          }
        } else {
          unmappedTexts.push(text);
        }
      });

      return this._fillResultsGaps(results, unmappedTexts, originalBatch, expectedCount);
    } catch (error) {
      logger.error(`[${providerName}] Strict parse failed: ${error.message}`);
      return originalBatch.map(item => typeof item === 'object' ? (item.t || item.text) : item);
    }
  },

  /**
   * Normalizes parsed JSON into a flat array of items.
   * @private
   */
  _normalizeToItems(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object' || parsed === null) return [parsed];

    let potentialItems = parsed.translations || parsed.results || Object.values(parsed).find(v => Array.isArray(v));
    
    if (typeof potentialItems === 'string') {
      try {
        potentialItems = JSON.parse(potentialItems);
      } catch {
        try {
          const repaired = potentialItems.replace(/'/g, '"').replace(/\\"/g, '"');
          potentialItems = JSON.parse(repaired);
        } catch { /* ignore */ }
      }
    }
    
    return Array.isArray(potentialItems) ? potentialItems : Object.values(parsed);
  },

  /**
   * Extracts text and ID from a single AI result item.
   * @private
   */
  _extractItemData(item) {
    if (typeof item !== 'object' || item === null) {
      return { text: String(item), id: null };
    }

    let id = item.i !== undefined ? item.i : (item.id !== undefined ? item.id : null);
    let text = item.t || item.text || item.translation || '';
    
    if (!text && typeof id === 'object' && id !== null) {
      const keys = Object.keys(id);
      if (keys.length > 0) {
        text = id[keys[0]];
        id = keys[0];
      }
    }
    
    if (!text) {
      const values = Object.values(item).filter(v => typeof v === 'string' && v.length > 2);
      if (values.length > 0) {
        // Exclude values that look like technical keys or JSON braces
        const candidates = values.filter(v => 
          !/^[a-z0-9-]{10,}$/i.test(v) && 
          v.trim() !== '{' && 
          v.trim() !== '[' &&
          !v.includes('":') &&
          !v.includes("':") // Avoid picking single-quoted JSON keys as text
        );
        text = candidates.length > 0 ? candidates.sort((a, b) => b.length - a.length)[0] : '';
      }
    }

    if (typeof text === 'string' && (text.startsWith('{') || text.startsWith('['))) {
      try {
        const inner = JSON.parse(text);
        if (typeof inner === 'object' && inner !== null) {
          text = inner.t || inner.text || inner.translation || Object.values(inner)[0] || text;
        }
      } catch { /* ignore */ }
    }

    // FINAL SAFETY: Ensure text is always a string to prevent [object Object] leaks in the UI
    if (text !== null && typeof text === 'object') {
      text = text.t || text.text || text.translation || Object.values(text)[0] || JSON.stringify(text);
    }

    return { text: String(text || ''), id };
  },

  /**
   * Finds the index of the original segment matching the AI's ID.
   * @private
   */
  _findOriginalIndex(id, originalBatch, expectedCount) {
    const idx = typeof id === 'string' 
      ? originalBatch.findIndex(ob => (typeof ob === 'object' ? (ob.i || ob.uid || ob.id) : null) === id)
      : parseInt(id, 10);
      
    return (idx !== -1 && idx >= 0 && idx < expectedCount) ? idx : -1;
  },

  /**
   * Fills gaps in results with sequential unmapped translations.
   * @private
   */
  _fillResultsGaps(results, unmappedTexts, originalBatch, expectedCount) {
    let unmappedIdx = 0;
    for (let i = 0; i < expectedCount; i++) {
      if (results[i] === null) {
        results[i] = unmappedTexts[unmappedIdx] || 
                    (typeof originalBatch[i] === 'object' ? (originalBatch[i].t || originalBatch[i].text) : originalBatch[i]) || '';
        unmappedIdx++;
      }
    }
    return results;
  },

  /**
   * Strips markdown code blocks if present.
   * @private
   */
  _stripMarkdown(text) {
    const markdownMatch = text.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
    return markdownMatch ? markdownMatch[1].trim() : text;
  },

  /**
   * Attempts to extract and parse JSON from the response.
   * @private
   */
  _extractAndParseJson(text, expectedFormat) {
    if (!text || typeof text !== 'string') return null;
    let jsonString = text.trim();

    if (this._isGarbageOutput(jsonString)) throw new Error("AI returned repetitive garbage output");

    try { return JSON.parse(jsonString); } catch {
      try { return JSON.parse(this._repairTruncatedJson(jsonString)); } catch { /* ignore */ }
    }

    const cleaned = this._stripMarkdown(jsonString);
    if (cleaned !== jsonString) {
      try { return JSON.parse(cleaned); } catch {
        try { return JSON.parse(this._repairTruncatedJson(cleaned)); } catch { /* ignore */ }
      }
    }

    return this._parseByBoundaries(jsonString, expectedFormat);
  },

  /**
   * Robust boundary-based JSON extraction.
   * @private
   */
  _parseByBoundaries(jsonString, expectedFormat) {
    const searchIndices = [jsonString.indexOf('['), jsonString.indexOf('{')]
      .filter(i => i !== -1)
      .sort((a, b) => a - b);

    for (const start of searchIndices) {
      const lastToken = jsonString[start] === '[' ? ']' : '}';
      const lastIndex = jsonString.lastIndexOf(lastToken);
      
      if (lastIndex > start) {
        const candidate = jsonString.substring(start, lastIndex + 1);
        try { return JSON.parse(candidate); } catch {
          try { return JSON.parse(this._repairTruncatedJson(candidate)); } catch { /* ignore */ }
        }
      } else {
        try {
          const candidate = jsonString.substring(start);
          return JSON.parse(this._repairTruncatedJson(candidate));
        } catch { /* ignore */ }
      }
    }

    return this._handleFallback(jsonString, expectedFormat);
  },

  /**
   * Final fallback if JSON parsing fails.
   */
  _handleFallback(jsonString, expectedFormat) {
    const cleanText = this._stripMarkdown(jsonString);
    
    // SAFETY CHECK: Re-evaluate if this looks like JSON garbage (single or double quotes)
    const isJsonGarbage = (cleanText.startsWith('{') || cleanText.startsWith('[')) && 
                          (cleanText.includes('":') || cleanText.includes('":') || 
                           cleanText.includes("':") || cleanText.includes("' :"));

    if (isJsonGarbage) {
      throw new Error(`AI returned malformed JSON that couldn't be parsed as ${expectedFormat}`);
    }

    if (expectedFormat === ResponseFormat.JSON_OBJECT) return { translations: [{ text: cleanText }] };
    if (expectedFormat === ResponseFormat.JSON_ARRAY) return [cleanText];

    throw new Error(`Failed to parse response as ${expectedFormat}`);
  },

  /**
   * Detect repetitive 'garbage' output.
   * @private
   */
  _isGarbageOutput(text) {
    if (text.length <= 100) return false;
    const sample = text.substring(0, 50);
    const occurrences = (text.match(new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return occurrences > 5;
  },

  /**
   * Attempts to repair a truncated JSON string.
   * @private
   */
  _repairTruncatedJson(json) {
    if (!json || typeof json !== 'string') return json;
    let repaired = json.trim();

    // Specific AI fixes
    repaired = repaired.replace(/translations'\s*:/g, '"translations":');
    repaired = repaired.replace(/,\s*$/, '');
    if (repaired.endsWith('\\')) repaired = repaired.substring(0, repaired.length - 1);

    const openBraces = (repaired.match(/\{/g) || []).length;
    const closedBraces = (repaired.match(/\}/g) || []).length;
    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closedBrackets = (repaired.match(/\]/g) || []).length;

    // Fix unclosed strings before structure
    if ((repaired.match(/"/g) || []).length % 2 !== 0) repaired += '"';

    for (let i = 0; i < (openBraces - closedBraces); i++) repaired += '}';
    for (let i = 0; i < (openBrackets - closedBrackets); i++) repaired += ']';

    return repaired.replace(/,\s*([\]}])/g, '$1');
  }
};
