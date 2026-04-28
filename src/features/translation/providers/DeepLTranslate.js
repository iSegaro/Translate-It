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
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { 
  getProviderLanguageCode,
  PROVIDER_LANGUAGE_MAPPINGS
} from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { matchErrorToType, isFatalError } from '@/shared/error-management/ErrorMatcher.js';

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
    // Extract XML tags from request
    const requestTags = requestText.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi);
    const requestTagCount = requestTags ? requestTags.length : 0;

    // Extract XML tags from response
    const responseTags = responseText.match(/<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi);
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

    // Check 2: Validate tag syntax integrity
    const malformedPatterns = [
      /<x\s+id[^>]*[^/]>/gi,      // Missing closing slash: <x id="0">
      /<x\s+id=\s*[^"'][^>]*>/gi,  // Missing quotes: <x id=0/>
      /<x\s+[^i]/gi,                // Missing id attribute: <x/>
      /<\s*x/gi                     // Space after <: < x>
    ];

    for (const pattern of malformedPatterns) {
      if (pattern.test(responseText)) {
        return {
          isValid: false,
          error: 'malformed_tags',
          details: {
            pattern: pattern.source
          }
        };
      }
    }

    // Check 3: Verify all placeholder IDs are unique and present
    const requestIds = new Set();
    const requestIdMatch = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
    let match;
    while ((match = requestIdMatch.exec(requestText)) !== null) {
      requestIds.add(parseInt(match[1], 10));
    }

    const responseIds = new Set();
    const responseIdMatch = /<x\s+id\s*=\s*["'](\d+)["']\s*\/?>/gi;
    while ((match = responseIdMatch.exec(responseText)) !== null) {
      const id = parseInt(match[1], 10);
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
    const validTexts = chunkTexts.filter(text => text && text.trim().length > 0);

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

    // Step 1: Detect XML placeholders in request
    const hasXMLPlaceholders = validTexts.some(text =>
      /<x\s+id\s*=\s*["']\d+["']\s*\/?>/gi.test(text)
    );

    logger.debug('[DeepL] XML placeholder detection:', {
      hasXMLPlaceholders,
      textCount: validTexts.length
    });

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

    // CRITICAL: Use XML-based markers to preserve ALL newlines
    // This is much safer than text markers like " @ " which can confuse DeepL
    const BLANK_LINE_MARKER = '<n2/>';  // Marker for \n\n
    const SINGLE_NEWLINE_MARKER = '<n1/>';  // Marker for \n

    const textsToTranslate = validTexts.map(text => {
      // CRITICAL: Sanitize text before processing to remove problematic characters
      const sanitizedText = sanitizeText(text);

      // Step 1: Replace blank lines (\n\n) with their marker
      let processed = sanitizedText.replace(/\n\n+/g, (match) => {
        const blankLineCount = Math.floor(match.length / 2);
        return BLANK_LINE_MARKER.repeat(blankLineCount);
      });

      // Step 2: Replace remaining single newlines (\n) with their marker
      processed = processed.replace(/\n/g, SINGLE_NEWLINE_MARKER);

      return processed;
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
    // This enables DeepL's native XML tag preservation
    requestBody.append('tag_handling', 'xml');
    // Ignore both newline markers and any existing placeholders
    requestBody.append('ignore_tags', 'n1,n2,x');

    logger.debug('[DeepL] XML tag handling enabled', {
      tag_handling: 'xml',
      ignore_tags: 'n1,n2,x'
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
    requestBody.append('split_sentences', 'nonewlines'); // Preserve newlines in translation
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

    const originalCharCount = this._calculateTraditionalCharCount(chunkTexts);

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

          // Restore ALL newlines by replacing XML markers with their original format
          const restoredTranslations = validTranslations.map(translation => {
            let restored = translation;

            // Step 1: Restore blank lines first (<n2/> → \n\n)
            if (restored.includes('<n2/>')) {
              restored = restored.replace(/<n2\s*\/?>/g, '\n\n');
            }

            // Step 2: Then restore single newlines (<n1/> → \n)
            if (restored.includes('<n1/>')) {
              restored = restored.replace(/<n1\s*\/?>/g, '\n');
            }

            // Step 3: Unescape XML entities back to original characters
            restored = unescapeXML(restored);

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
            const text = chunkTexts[i];
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
        charCount: this._calculateTraditionalCharCount(validTexts),
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
        return chunkTexts.map(t => typeof t === 'object' ? (t.t || t.text || "") : t);
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
            .catch(() => firstHalf.map(t => typeof t === 'object' ? (t.t || t.text || "") : t)),
          this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, segmentCount, chunkIndex, totalChunks, options)
            .catch(() => secondHalf.map(t => typeof t === 'object' ? (t.t || t.text || "") : t))
        ]);

        return [...firstResult, ...secondResult];
      }

      // Final fallback for HTTP 400: translate each segment individually
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt >= 3) {
        logger.debug(`[DeepL] Exhausted retries, attempting sequential fallback for ${validTexts.length} segments`);

        const results = [];
        for (const text of chunkTexts) {
          const originalText = typeof text === 'object' ? (text.t || text.text || "") : (text || "");
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
