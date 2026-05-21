// src/features/translation/providers/DeepLTranslate.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getDeeplApiKeysAsync,
  getDeeplApiTierAsync,
  getDeeplFormalityAsync,
  getDeeplBetaLanguagesEnabledAsync,
  getDeeplFreeApiUrlAsync,
  getDeeplProApiUrlAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/constants/core.js";
import { 
  getProviderLanguageCode,
  PROVIDER_LANGUAGE_MAPPINGS
} from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { getTextInfo } from "./utils/TraditionalTextProcessor.js";
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';
import { NewlineManager } from '@/features/translation/utils/NewlineManager.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepLTranslate');

export class DeepLTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "DeepL Translate";
  static description = "AI-powered translation by DeepL";
  static reliableJsonMode = false;
  static supportsDictionary = false;

  // BaseTranslateProvider capabilities (Default values)
  // NOTE: Character limits and chunk sizes are now dynamically managed 
  // by ProviderConfigurations.js based on the active Optimization Level.
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.DEEPL;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.DEEPL;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.DEEPL;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.DEEPL;

  constructor() {
    super(ProviderNames.DEEPL_TRANSLATE);
    this.providerSettingKey = 'DEEPL_API_KEY';
  }

  /**
   * Get configuration using project's existing config system
   * Uses StorageManager's built-in caching and config.js helpers
   */
  async _getConfig() {
    try {
      // Use project's existing config system with built-in caching
      const [apiKeys, apiTier] = await Promise.all([
        getDeeplApiKeysAsync(),
        getDeeplApiTierAsync(),
      ]);

      // Get first available key
      const apiKey = apiKeys.length > 0 ? apiKeys[0] : '';

      // Get API endpoint based on tier
      const apiUrl = apiTier === 'pro'
        ? await getDeeplProApiUrlAsync()
        : await getDeeplFreeApiUrlAsync();

      // Configuration loaded successfully
      logger.info(`[DeepL] Using tier: ${apiTier}`);

      return { apiKey, apiTier, apiUrl };
    } catch (error) {
      logger.error(`[DeepL] Error loading configuration:`, error);
      throw error;
    }
  }

  /**
   * Convert language code to DeepL uppercase format
   * @param {string} lang - Language code or name
   * @returns {string} DeepL language code (uppercase)
   */
  _getLangCode(lang) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return ''; // DeepL auto-detect uses empty string

    return getProviderLanguageCode(normalized, 'DEEPL');
  }

  /**
   * Validate XML placeholder integrity in DeepL response
   * @param {string} requestText - Original text sent to DeepL
   * @param {string} responseText - Translated text received from DeepL
   * @returns {Object} Validation result with isValid flag and error details
   */
  _validateXMLPlaceholders(requestText, responseText) {
    const xmlTagRegex = /<(?:x|br)\s+id\s*=\s*["']([A-Za-z0-9_]+)["']\s*\/?>/gi;

    // Extract XML tags from request
    const requestTags = requestText.match(xmlTagRegex);
    const requestTagCount = requestTags ? requestTags.length : 0;

    // Extract XML tags from response
    const responseTags = responseText.match(xmlTagRegex);
    const responseTagCount = responseTags ? responseTags.length : 0;

    // Check 1: Tag count mismatch
    if (requestTagCount !== responseTagCount) {
      return {
        isValid: false,
        error: 'tag_count_mismatch',
        details: {
          requestTagCount,
          responseTagCount
        }
      };
    }

    // Check 2: Validate tag syntax integrity (REMOVED)
    // DeepL API can sometimes alter spacing or expand tags, which causes false positives here.
    // As long as the tags can be parsed and IDs match, we are good.

    // Check 3: Verify all placeholder IDs are unique and present
    const requestIds = new Set();
    const requestIdMatch = /<(?:x|br)\s+id\s*=\s*["']([A-Za-z0-9_]+)["']\s*\/?>/gi;
    let match;
    while ((match = requestIdMatch.exec(requestText)) !== null) {
      requestIds.add(match[1]);
    }

    const responseIds = new Set();
    const responseIdMatch = /<(?:x|br)\s+id\s*=\s*["']([A-Za-z0-9_]+)["']\s*\/?>/gi;
    while ((match = responseIdMatch.exec(responseText)) !== null) {
      const id = match[1];
      if (responseIds.has(id)) {
        // Duplicate ID found
        return {
          isValid: false,
          error: 'duplicate_ids',
          details: {
            duplicateId: id
          }
        };
      }
      responseIds.add(id);
    }

    // Check 4: All request IDs present in response
    for (const id of requestIds) {
      if (!responseIds.has(id)) {
        return {
          isValid: false,
          error: 'missing_ids',
          details: {
            missingId: id
          }
        };
      }
    }

    return {
      isValid: true,
      details: {
        requestTagCount,
        responseTagCount
      }
    };
  }

  /**
   * Translate a single chunk of texts using DeepL API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language (DeepL code)
   * @param {string} targetLang - Target language (DeepL code)
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Total number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {Object} options - Additional options (sessionId, originalCharCount)
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
    // Recover sessionId from abortController if available
    const sessionId = options.sessionId || abortController?.sessionId;
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;

    // Normalize language codes
    const sl = this._getLangCode(sourceLang, true); // Enable beta for normalization
    const tl = this._getLangCode(targetLang, true);

    // Get configuration and validate API key
    const { apiKey, apiUrl } = await this._getConfig();

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      context
    );

    // Filter out empty or whitespace-only texts (DeepL rejects them)
    // Use getTextInfo to extract text from objects (Subtitle cues, Select Element)
    const validTexts = chunkTexts
      .map(item => getTextInfo(item).text)
      .filter(text => text && text.trim().length > 0);

    if (validTexts.length === 0) {
      logger.warn('[DeepL] No valid texts to translate after filtering');
      return chunkTexts.map(() => '');
    }

    // CRITICAL: Pre-compile regex patterns FIRST, before any usage
    // Build control character pattern from character codes to avoid lint errors
    const CONTROL_CHAR_CODES = [
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,  // \x00-\x08
      0x0B, 0x0C,  // \x0B-\x0C (vertical tab, form feed)
      0x0E, 0x0F, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F,  // \x0E-\x1F
      0x7F  // DEL
    ];
    const CONTROL_CHARS_PATTERN = new RegExp(`[${CONTROL_CHAR_CODES.map(c => String.fromCharCode(c)).join('')}]`, 'g');
    const ZERO_WIDTH_PATTERN = /[\u200B-\u200D\uFEFF]/g;
    const SPECIAL_UNICODE_PATTERN = /[\uFFF0-\uFFFF]/g;

    // Pattern to detect potentially problematic characters BEFORE escaping
    // These cause "not well-formed" errors in XML mode
    const PROBLEMATIC_XML_CHARS = /[<>&]|&#?\w+;/;

    // Unescape XML entities back to original characters after translation
    const unescapeXML = (text) => {
      if (!text) return text;
      return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');  // Must be last to avoid double-unescaping
    };

    // PRE-FLIGHT: Detect texts with problematic XML characters
    // This helps identify which segments would cause HTTP 400 errors
    const problematicIndices = [];
    validTexts.forEach((text, i) => {
      if (PROBLEMATIC_XML_CHARS.test(text)) {
        problematicIndices.push(i);
      }
    });

    if (problematicIndices.length > 0) {
      logger.debug(`[DeepL] Pre-flight: Found ${problematicIndices.length} texts with XML-special chars (indices: ${problematicIndices.join(', ')}) - will escape them`);
    }

    if (validTexts.length < chunkTexts.length) {
      logger.debug(`[DeepL] Filtered ${chunkTexts.length - validTexts.length} empty/whitespace texts`);
    }

    const sanitizeText = (text) => {
      const originalLength = text.length;
      let sanitized = text
        .replace(ZERO_WIDTH_PATTERN, '')  // Zero-width characters
        .replace(CONTROL_CHARS_PATTERN, '')  // Control chars except \n, \r, \t
        .replace(SPECIAL_UNICODE_PATTERN, '');  // Other special Unicode characters

      // CRITICAL: Escape XML special characters BEFORE adding XML markers
      // This prevents "not well-formed (invalid token)" errors when tag_handling=xml
      // Order matters: escape & first, then < and >
      sanitized = sanitized
        .replace(/&/g, '&amp;')           // Must be first to avoid double-escaping
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Log if sanitization removed any characters
      if (sanitized.length !== originalLength) {
        logger.debug(`[DeepL] Sanitization processed ${originalLength} char text (removed special chars, escaped XML)`);
      }

      return sanitized;
    };

    const textsToTranslate = validTexts.map(text => {
      // CRITICAL: Sanitize text before processing to remove problematic characters
      let sanitizedText = sanitizeText(text);

      // CRITICAL: Convert SubtitleTextProtector tokens to DeepL XML tags
      // Do this AFTER sanitization so the < and > don't get escaped
      
      // 1. Convert newline tokens to <br> tags. This is crucial because DeepL treats <br> as a hard 
      // sentence boundary and will not merge sentences across it or move it to the edges.
      sanitizedText = sanitizedText.replace(/@@SUB_NL_([A-Za-z0-9_]+)@@/g, '<br id="SUB_NL_$1" />');
      
      // 2. Convert other tokens (formatting, styles) to standard <x> placeholders
      sanitizedText = sanitizedText.replace(/@@SUB_([A-Za-z0-9_]+)@@/g, '<x id="SUB_$1" />');

      // Protect any other newlines using the unified NewlineManager
      let textWithMarkers = NewlineManager.protect(sanitizedText);
      
      // Convert standard NewlineManager markers to HTML <br/> tags as well
      textWithMarkers = textWithMarkers.replace(/<n1\s*\/?>/gi, '<br/>');
      textWithMarkers = textWithMarkers.replace(/<n2\s*\/?>/gi, '<br/><br/>');
      
      return textWithMarkers;
    });

    // Step 1: Detect XML placeholders in request (after conversion)
    const hasXMLPlaceholders = textsToTranslate.some(text =>
      /<x\s+id\s*=\s*["'][A-Za-z0-9_]+["']\s*\/?>/gi.test(text)
    );

    logger.debug('[DeepL] XML placeholder detection:', {
      hasXMLPlaceholders,
      textCount: validTexts.length
    });

    // Get beta languages setting
    let betaLanguagesEnabled = await getDeeplBetaLanguagesEnabledAsync();

    // Auto-detect: if source or target language is a beta language, enable beta languages
    // Check if sl is a beta language
    const sourceIsBeta = sl && sl !== '' &&
      !PROVIDER_LANGUAGE_MAPPINGS.DEEPL[sourceLang.toLowerCase()] &&
      PROVIDER_LANGUAGE_MAPPINGS.DEEPL_BETA[sourceLang.toLowerCase()];

    // Check if tl is a beta language
    const targetIsBeta = tl &&
      !PROVIDER_LANGUAGE_MAPPINGS.DEEPL[targetLang.toLowerCase()] &&
      PROVIDER_LANGUAGE_MAPPINGS.DEEPL_BETA[targetLang.toLowerCase()];

    // Auto-enable beta languages if needed
    if (sourceIsBeta || targetIsBeta) {
      betaLanguagesEnabled = true;
      logger.info(`[DeepL] Auto-enabling beta languages for ${sourceIsBeta ? 'source' : ''}${sourceIsBeta && targetIsBeta ? ' and ' : ''}${targetIsBeta ? 'target' : ''} language`);
    }

    // Add key info log for translation start
    logger.info(`[DeepL] Starting translation: ${validTexts.join('').length} chars, ${validTexts.length} segments (filtered from ${chunkTexts.length}), beta languages: ${betaLanguagesEnabled}`);

    // Build request body with valid texts only (with text markers for newlines)
    const requestBody = new URLSearchParams();
    textsToTranslate.forEach(text => requestBody.append('text', text));

    // DeepL uses empty source_lang for auto-detection
    if (sl && sl !== '') {
      requestBody.append('source_lang', sl);
    }
    requestBody.append('target_lang', tl);

    // Add formality parameter (not supported for beta languages)
    const formality = await getDeeplFormalityAsync() || 'default';
    if (formality !== 'default' && !betaLanguagesEnabled) {
      requestBody.append('formality', formality);
    }

    // Add beta languages parameter if enabled
    if (betaLanguagesEnabled) {
      requestBody.append('enable_beta_languages', '1');
    }

    // CRITICAL: Add XML tag handling parameters
    // This enables DeepL's native XML tag preservation.
    // We MUST NOT use 'ignore_tags' for <x> or <n1> because DeepL's engine often completely deletes
    // empty ignored tags (which causes the translated output to lose SRT tags and newlines).
    // By simply enabling XML mode, DeepL treats them as structural elements and preserves them perfectly.
    requestBody.append('tag_handling', 'xml');
    
    // IMPORTANT: Force DeepL to treat <n1>, <n2>, and <br> as hard sentence splits.
    // This prevents DeepL from artificially moving newline markers to the beginning or end of a translation block.
    requestBody.append('splitting_tags', 'n1,n2,br');

    logger.debug('[DeepL] XML tag handling enabled', {
      tag_handling: 'xml',
      splitting_tags: 'n1,n2,br'
    });

    // 1. Prepare rich context (Environmental + Compact History)
    // DeepL context is free and significantly improves quality for related segments.
    const { AIConversationHelper } = await import("./utils/AIConversationHelper.js");
    const richContext = await AIConversationHelper.prepareDeepLContext(sessionId, options.contextMetadata, translateMode);

    if (richContext) {
      requestBody.append('context', richContext);
      logger.debug('[DeepL] Rich context integrated', { 
        length: richContext.length,
        preview: richContext.substring(0, 100) + '...'
      });
    }

    // Additional options
    // CRITICAL: We must NOT use 'nonewlines' here. If we use 'nonewlines', DeepL treats the entire
    // block as a single sentence and will aggressively merge phrases (e.g. "OK\nLet's do it" -> "باشه انجامش بدیم")
    // which results in the newline being pushed to the very beginning or end of the string.
    // By using '1' (default), DeepL splits at newlines and preserves their exact structural position.
    requestBody.append('split_sentences', '1');
    requestBody.append('preserve_formatting', '1'); // true

    // Debug log the request (without exposing full text content)
    logger.debug('[DeepL] Request details:', {
      textCount: validTexts.length,
      totalChars: this._calculateTraditionalCharCount(validTexts),
      sourceLang: sl || 'auto',
      targetLang: tl,
      betaLanguages: betaLanguagesEnabled,
      hasXMLPlaceholders,
      hasContext: !!richContext
    });

    const originalCharCount = chunkTexts.reduce((s, t) => s + getTextInfo(t).length, 0);

    try {
      const result = await this._executeRequest({
        url: apiUrl,
        fetchOptions: {
          method: "POST",
          headers: {
            "Authorization": `DeepL-Auth-Key ${apiKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: requestBody,
        },
        extractResponse: (data) => {
          if (!data?.translations || !Array.isArray(data.translations)) {
            logger.warn('[DeepL] Invalid API response format');
            return chunkTexts.map(() => '');
          }

          // Capture detected source language from metadata if available (using first segment)
          this._setDetectedLanguage(data.translations[0]?.detected_source_language);

          // DeepL returns array of translation objects for valid texts only
          const validTranslations = data.translations.map(t => t.text || '');

          // CRITICAL: Validate XML placeholders if present in request
          if (hasXMLPlaceholders) {
            for (let i = 0; i < validTranslations.length; i++) {
              const requestText = textsToTranslate[i];
              const responseText = validTranslations[i];

              const validation = this._validateXMLPlaceholders(requestText, responseText);

              if (!validation.isValid) {
                logger.error('[DeepL] XML placeholder validation failed', {
                  index: i,
                  error: validation.error,
                  details: validation.details
                });

                // Throw special error with XML corruption flag to trigger fallback
                const error = new Error(`XML placeholder validation failed: ${validation.error}`);
                error.isXMLCorruptionError = true;
                error.validationDetails = validation.details;
                error.errorIndex = i;
                throw error;
              }
            }

            logger.debug('[DeepL] XML placeholder validation passed for all translations');
          }

          // Restore ALL newlines using the unified NewlineManager
          const restoredTranslations = validTranslations.map(translation => {
            // Step 0: Restore standard <br/> tags back to newlines
            let restored = translation.replace(/<br\s*\/?>/gi, '\n');

            // Step 1: Restore newlines from markers (fallback)
            restored = NewlineManager.restore(restored);

            // Step 2: Unescape XML entities back to original characters
            restored = unescapeXML(restored);

            // Step 3: Restore SubtitleTextProtector tokens.
            // Restore newline tokens (which were sent as <br id="...">)
            restored = restored.replace(/<br\s+id\s*=\s*["']SUB_NL_([A-Za-z0-9_]+)["']\s*\/?>\s*(?:<\/br>\s*)?/gi, '@@SUB_NL_$1@@');
            // Restore other tokens (which were sent as <x id="...">)
            restored = restored.replace(/<x\s+id\s*=\s*["']SUB_([A-Za-z0-9_]+)["']\s*\/?>\s*(?:<\/x>\s*)?/gi, '@@SUB_$1@@');

            return restored;
          });

          // Validate segment count (should match valid texts, not original chunkTexts)
          if (restoredTranslations.length !== validTexts.length) {
            logger.debug('[DeepL] Segment count mismatch');
          }

          // Map translations back to original chunkTexts order
          // Fill in empty strings for filtered texts
          const result = [];
          let validIndex = 0;

          for (let i = 0; i < chunkTexts.length; i++) {
            const text = getTextInfo(chunkTexts[i]).text;
            if (text && text.trim().length > 0) {
              // This text was translated - use restored translation
              result.push(restoredTranslations[validIndex] || '');
              validIndex++;
            } else {
              // This text was filtered out, return empty
              result.push('');
            }
          }

          return result;
        },
        context,
        abortController,
        charCount: validTexts.join('').length,
        sessionId: options.sessionId,
        originalCharCount: options.originalCharCount || originalCharCount
      });

      const finalResult = result || chunkTexts.map(() => '');

      // Add completion log for successful translation
      if (finalResult.length > 0) {
        logger.info(`[DeepL] Translation completed successfully`);
      }

      return finalResult;
    } catch (error) {
      // CRITICAL: Check if this is an XML corruption error and trigger fallback
      if (error.isXMLCorruptionError) {
        logger.error('[DeepL] XML corruption detected, falling back to original text for this chunk');
        return chunkTexts.map(t => getTextInfo(t).text);
      }

      // If HTTP 400 error and we have more than 1 segment, try splitting into smaller chunks
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt < 3) {
        logger.debug(`[DeepL] HTTP 400 error, retrying with smaller chunks (${retryAttempt + 1}/3)`);

        const midPoint = Math.ceil(chunkTexts.length / 2);
        const firstHalf = chunkTexts.slice(0, midPoint);
        const secondHalf = chunkTexts.slice(midPoint);

        // Run both halves in parallel for better performance during fallback
        const [firstResult, secondResult] = await Promise.all([
          this._translateChunk(firstHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, segmentCount, chunkIndex, totalChunks, options)
            .catch(() => firstHalf.map(t => getTextInfo(t).text)),
          this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, segmentCount, chunkIndex, totalChunks, options)
            .catch(() => secondHalf.map(t => getTextInfo(t).text))
        ]);

        return [...firstResult, ...secondResult];
      }

      // Final fallback for HTTP 400: translate each segment individually
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt >= 3) {
        logger.debug(`[DeepL] Exhausted retries, attempting sequential fallback for ${validTexts.length} segments`);

        const results = [];
        for (const text of chunkTexts) {
          const originalText = getTextInfo(text).text;
          if (!originalText || originalText.trim().length === 0) {
            results.push('');
            continue;
          }

          try {
            // Simplified call for single segment fallback
            const res = await this._translateChunk([text], sourceLang, targetLang, translateMode, abortController, 5, 1, 0, 1, options);
            results.push(Array.isArray(res) ? res[0] : res);
          } catch {
            results.push(originalText);
          }
        }

        logger.info(`[DeepL] Sequential fallback completed`);
        return results;
      }

      // Otherwise, rethrow the error
      const errorType = error.type || matchErrorToType(error);
      if (isFatalError(error) || isFatalError(errorType)) {
        if (!error.type) error.type = errorType;
      }
      throw error;
    }
  }
}
