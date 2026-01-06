// src/features/translation/providers/DeepLTranslate.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getDeeplApiKeysAsync,
  getDeeplApiTierAsync,
  getDeeplFormalityAsync,
  getDeeplBetaLanguagesEnabledAsync
} from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { PROVIDER_LANGUAGE_MAPPINGS } from "@/shared/config/languageConstants.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepLTranslate');

// Use mappings from languageConstants.js
const DEEPL_LANG_CODE_MAP = PROVIDER_LANGUAGE_MAPPINGS.DEEPL;
const DEEPL_BETA_LANG_CODE_MAP = PROVIDER_LANGUAGE_MAPPINGS.DEEPL_BETA;

export class DeepLTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static displayName = "DeepL Translate";
  static description = "AI-powered translation by DeepL";
  static reliableJsonMode = false;
  static supportsDictionary = false;
  static CHAR_LIMIT = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.DEEPL;

  // BaseTranslateProvider capabilities
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
        ? 'https://api.deepl.com/v2/translate'
        : 'https://api-free.deepl.com/v2/translate';

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
   * @param {boolean} enableBetaLanguages - Whether beta languages are enabled
   * @returns {string} DeepL language code (uppercase)
   */
  _getLangCode(lang, enableBetaLanguages = false) {
    const normalized = LanguageSwappingService._normalizeLangValue(lang);
    if (normalized === AUTO_DETECT_VALUE) return ''; // DeepL auto-detect uses empty string

    // Check standard languages first
    if (DEEPL_LANG_CODE_MAP[normalized]) {
      return DEEPL_LANG_CODE_MAP[normalized];
    }

    // Check beta languages if enabled
    if (enableBetaLanguages && DEEPL_BETA_LANG_CODE_MAP[normalized]) {
      return DEEPL_BETA_LANG_CODE_MAP[normalized];
    }

    // Convert to uppercase as fallback
    return normalized.toUpperCase().replace(/-/g, '-');
  }

  /**
   * Translate a single chunk of texts using DeepL API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language (DeepL code)
   * @param {string} targetLang - Target language (DeepL code)
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt = 0, chunkIndex = 0, totalChunks = 1) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;

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

    if (validTexts.length < chunkTexts.length) {
      logger.debug(`[DeepL] Filtered ${chunkTexts.length - validTexts.length} empty/whitespace texts`);
    }

    // Sanitize texts: Remove problematic characters that DeepL might reject
    // This includes zero-width characters and other control characters (except newlines)

    // Pre-compile regex patterns once for better performance
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

    const sanitizeText = (text) => {
      const originalLength = text.length;
      const sanitized = text
        .replace(ZERO_WIDTH_PATTERN, '')  // Zero-width characters
        .replace(CONTROL_CHARS_PATTERN, '')  // Control chars except \n, \r, \t
        .replace(SPECIAL_UNICODE_PATTERN, '');  // Other special Unicode characters

      // Log if sanitization removed any characters
      if (sanitized.length !== originalLength) {
        logger.debug(`[DeepL] Sanitization removed ${originalLength - sanitized.length} chars from ${originalLength} char text`);
      }

      return sanitized;
    };

    // CRITICAL FIX: Use text-based markers to preserve ALL newlines (both single and blank lines)
    // This avoids XML parsing issues and ensures line structure is maintained
    // Using " @@@ " for blank lines (\n\n) and " @ " for single newlines (\n)
    // After translation, convert markers back to their original newline format
    const BLANK_LINE_MARKER = ' @@@ ';  // Marker for \n\n (blank lines)
    const SINGLE_NEWLINE_MARKER = ' @ ';  // Marker for \n (single newlines)

    const textsToTranslate = validTexts.map(text => {
      // CRITICAL: Sanitize text before processing to remove problematic characters
      // This prevents HTTP 400 errors from DeepL API
      const sanitizedText = sanitizeText(text);

      // Check if text has newlines before processing
      const hasBlankLines = sanitizedText.includes('\n\n');
      const hasSingleNewlines = sanitizedText.includes('\n');

      // Step 1: First replace blank lines (\n\n) with their marker
      // We must do this BEFORE replacing single newlines to avoid conflicts
      let processed = sanitizedText.replace(/\n\n+/g, (match) => {
        const blankLineCount = Math.floor(match.length / 2);
        // Each \n\n becomes  @@@
        return BLANK_LINE_MARKER.repeat(blankLineCount);
      });

      // Step 2: Then replace remaining single newlines (\n) with their marker
      // These are newlines that weren't part of a blank line
      processed = processed.replace(/\n/g, SINGLE_NEWLINE_MARKER);

      if (hasBlankLines || hasSingleNewlines) {
        const blankLineCount = (sanitizedText.match(/\n\n+/g) || []).reduce((sum, match) => sum + Math.floor(match.length / 2), 0);
        const singleNewlineCount = (sanitizedText.match(/\n/g) || []).length - (blankLineCount * 2);
        logger.info(`[DeepL] Preserving ${blankLineCount} blank lines and ${singleNewlineCount} single newlines`);
      }

      return processed;
    });

    // Get beta languages setting
    let betaLanguagesEnabled = await getDeeplBetaLanguagesEnabledAsync();

    // Auto-detect: if source or target language is a beta language, enable beta languages
    // Check if sourceLang is a beta language (not in standard map but in beta map)
    const sourceIsBeta = sourceLang && sourceLang !== '' &&
      !DEEPL_LANG_CODE_MAP[sourceLang.toLowerCase()] &&
      DEEPL_BETA_LANG_CODE_MAP[sourceLang.toLowerCase()];

    // Check if targetLang is a beta language
    const targetIsBeta = targetLang &&
      !DEEPL_LANG_CODE_MAP[targetLang.toLowerCase()] &&
      DEEPL_BETA_LANG_CODE_MAP[targetLang.toLowerCase()];

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
    if (sourceLang && sourceLang !== '') {
      requestBody.append('source_lang', sourceLang);
    }
    requestBody.append('target_lang', targetLang);

    // Add formality parameter (not supported for beta languages)
    const formality = await getDeeplFormalityAsync() || 'default';
    if (formality !== 'default' && !betaLanguagesEnabled) {
      requestBody.append('formality', formality);
    }

    // Add beta languages parameter if enabled
    if (betaLanguagesEnabled) {
      requestBody.append('enable_beta_languages', '1');
    }

    // Note: No XML tag handling - using Unicode marker instead
    // This avoids XML parsing issues entirely

    // Additional options
    requestBody.append('split_sentences', 'nonewlines'); // Preserve newlines in translation
    requestBody.append('preserve_formatting', '1'); // true

    // Debug log the request (without exposing full text content)
    logger.debug('[DeepL] Request details:', {
      textCount: validTexts.length,
      totalChars: validTexts.join('').length,
      sourceLang: sourceLang || 'auto',
      targetLang,
      betaLanguages: betaLanguagesEnabled,
      formality: betaLanguagesEnabled ? 'N/A (beta)' : (await getDeeplFormalityAsync() || 'default')
    });

    try {
      const result = await this._executeWithErrorHandling({
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
            logger.error('[DeepL] Invalid API response:', data);
            return chunkTexts.map(() => '');
          }

          // DeepL returns array of translation objects for valid texts only
          const validTranslations = data.translations.map(t => t.text || '');

          // Restore ALL newlines by replacing text markers with their original format
          const restoredTranslations = validTranslations.map(translation => {
            // Check if markers exist in translation
            const hasBlankMarkers = translation.includes(' @@@ ');
            const hasSingleMarkers = translation.includes(' @ ');

            if (!hasBlankMarkers && !hasSingleMarkers) {
              return translation;
            }

            let restored = translation;

            // Step 1: Restore blank lines first (@@@ → \n\n)
            if (hasBlankMarkers) {
              restored = restored.replace(
                / @@@ /g,
                () => '\n\n'  // Each  @@@  becomes \n\n
              );
              const totalBlankMarkers = (translation.match(/ @@@ /g) || []).length;
              logger.info(`[DeepL] Restored ${totalBlankMarkers} blank lines from " @@@"`);
            }

            // Step 2: Then restore single newlines (@ → \n)
            if (hasSingleMarkers) {
              restored = restored.replace(
                / @ /g,
                () => '\n'  // Each  @  becomes \n
              );
              const totalSingleMarkers = (translation.match(/ @ /g) || []).length;
              logger.info(`[DeepL] Restored ${totalSingleMarkers} single newlines from " @"`);
            }

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
      });

      const finalResult = result || chunkTexts.map(() => '');

      // Add completion log for successful translation
      if (finalResult.length > 0) {
        logger.info(`[DeepL] Translation completed successfully`);
      }

      return finalResult;
    } catch (error) {
      // If HTTP 400 error and we have more than 1 segment, try splitting into smaller chunks
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt < 5) {
        logger.debug(`[DeepL] HTTP 400 error with ${validTexts.length} segments, retrying with smaller chunks (attempt ${retryAttempt + 1}/5)`);

        // Split into smaller chunks and retry SEQUENTIALLY (not parallel)
        // DeepL Free API has issues with concurrent requests
        const midPoint = Math.ceil(validTexts.length / 2);
        const firstHalf = chunkTexts.slice(0, midPoint);
        const secondHalf = chunkTexts.slice(midPoint);

        let firstResult, secondResult;

        try {
          firstResult = await this._translateChunk(firstHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch {
          logger.debug(`[DeepL] First half failed, returning original texts for ${firstHalf.length} segments`);
          firstResult = firstHalf;
        }

        try {
          secondResult = await this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch {
          logger.debug(`[DeepL] Second half failed, returning original texts for ${secondHalf.length} segments`);
          secondResult = secondHalf;
        }

        return [...firstResult, ...secondResult];
      }

      // Final fallback for HTTP 400: translate each segment individually (sequential)
      // Only do this if we haven't already tried individual translation
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt >= 5) {
        logger.debug(`[DeepL] Retry attempts exhausted, attempting sequential one-by-one translation for ${validTexts.length} segments`);

        const results = [];
        let successCount = 0;
        const FALLBACK_BLANK_MARKER = ' @@@ ';  // Marker for \n\n in fallback
        const FALLBACK_SINGLE_MARKER = ' @ ';  // Marker for \n in fallback

        for (let i = 0; i < chunkTexts.length; i++) {
          const text = chunkTexts[i];
          // Skip empty texts
          if (!text || text.trim().length === 0) {
            results.push('');
            continue;
          }

          try {
            // CRITICAL: Sanitize text before processing to remove problematic characters
            // This prevents HTTP 400 errors from DeepL API in fallback mode
            // Reuse pre-compiled patterns for better performance
            const sanitizedText = text
              .replace(ZERO_WIDTH_PATTERN, '')  // Zero-width characters
              .replace(CONTROL_CHARS_PATTERN, '')  // Control chars except \n, \r, \t
              .replace(SPECIAL_UNICODE_PATTERN, '');  // Other special Unicode characters

            // Step 1: Convert blank lines (\n\n) to marker
            let textWithMarkers = sanitizedText.replace(/\n\n+/g, (match) => {
              const blankLineCount = Math.floor(match.length / 2);
              // Each \n\n becomes  @@@
              return FALLBACK_BLANK_MARKER.repeat(blankLineCount);
            });

            // Step 2: Convert single newlines (\n) to marker
            textWithMarkers = textWithMarkers.replace(/\n/g, FALLBACK_SINGLE_MARKER);

            // Translate single segment WITHOUT retry (to avoid infinite recursion)
            const requestBody = new URLSearchParams();
            requestBody.append('text', textWithMarkers);

            if (sourceLang && sourceLang !== '') {
              requestBody.append('source_lang', sourceLang);
            }
            requestBody.append('target_lang', targetLang);

            if (betaLanguagesEnabled) {
              requestBody.append('enable_beta_languages', '1');
            }
            // No XML tag handling - using text markers instead
            requestBody.append('split_sentences', 'nonewlines');
            requestBody.append('preserve_formatting', '1');

            const result = await this._executeWithErrorHandling({
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
                  return text; // Return original on error
                }
                let translated = data.translations[0]?.text || text;

                // Step 1: Restore blank lines (@@@ → \n\n)
                if (translated.includes(' @@@ ')) {
                  translated = translated.replace(
                    / @@@ /g,
                    () => '\n\n'
                  );
                }

                // Step 2: Restore single newlines (@ → \n)
                if (translated.includes(' @ ')) {
                  translated = translated.replace(
                    / @ /g,
                    () => '\n'
                  );
                }

                return translated;
              },
              context,
              abortController,
            });

            results.push(result || text);
            successCount++;
            logger.debug(`[DeepL] Sequential fallback: segment ${i + 1}/${chunkTexts.length} translated`);
          } catch {
            logger.debug(`[DeepL] Sequential fallback failed for segment ${i + 1}, using original`);
            results.push(text); // Return original text as fallback
          }
        }

        logger.info(`[DeepL] Sequential fallback completed: ${successCount}/${chunkTexts.length} segments translated`);
        return results;
      }

      // Otherwise, rethrow the error
      throw error;
    }
  }
}
