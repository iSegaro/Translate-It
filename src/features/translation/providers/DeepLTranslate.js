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

    // Preserve blank lines using XML tags (officially supported by DeepL)
    // Using <blank-line/> tags with XML tag handling enabled
    // See: https://developers.deepl.com/api-reference/translate#in-text-markup
    const BLANK_LINE_TAG = '<blank-line/>';

    const textsToTranslate = validTexts.map(text => {
      // Check if text has blank lines before processing
      const hasBlankLines = text.includes('\n\n');

      // Replace double newlines (blank lines) with XML tags
      const processed = text.replace(/\n\n+/g, (match) => {
        const blankLineCount = match.length; // Total count of newlines
        const blankLinePairs = Math.floor(blankLineCount / 2);
        const hasOddNewline = blankLineCount % 2 === 1;
        // Each \n\n becomes <blank-line/>
        // If odd count (e.g., \n\n\n), preserve trailing \n
        return BLANK_LINE_TAG.repeat(blankLinePairs) + (hasOddNewline ? '\n' : '');
      });

      if (hasBlankLines) {
        const blankLineCount = (text.match(/\n\n+/g) || []).reduce((sum, match) => sum + Math.floor(match.length / 2), 0);
        logger.info(`[DeepL] Preserving ${blankLineCount} blank lines using XML tags`);
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

    // Build request body with valid texts only (with blank line markers)
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

    // Enable XML tag handling to preserve <blank-line/> tags
    requestBody.append('tag_handling', 'xml');

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

          // Restore blank lines by replacing XML tags with \n\n
          const restoredTranslations = validTranslations.map(translation => {
            // Check if XML tags exist in translation
            const hasTags = translation.includes('<blank-line/>');

            if (hasTags) {
              // Replace XML tags with actual blank lines
              const restored = translation.replace(
                /<blank-line\/>(\n)?/g,
                (match, trailingNewline) => {
                  // Count how many tags in this match
                  const tagCount = (match.match(/<blank-line\/>/g) || []).length;
                  // Return corresponding number of \n\n plus trailing \n if present
                  return '\n\n'.repeat(tagCount) + (trailingNewline || '');
                }
              );
              const totalTags = (translation.match(/<blank-line\/>/g) || []).length;
              logger.info(`[DeepL] Restored ${totalTags} blank lines from XML tags`);
              return restored;
            } else {
              logger.debug('[DeepL] XML tags NOT preserved in translation, blank lines may be lost');
              return translation;
            }
          });

          // Validate segment count (should match valid texts, not original chunkTexts)
          if (restoredTranslations.length !== validTexts.length) {
            logger.debug('[DeepL] Segment count mismatch:', {
              expected: validTexts.length,
              received: restoredTranslations.length
            });
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
        const FALLBACK_TAG = '<blank-line/>';

        for (let i = 0; i < chunkTexts.length; i++) {
          const text = chunkTexts[i];
          // Skip empty texts
          if (!text || text.trim().length === 0) {
            results.push('');
            continue;
          }

          try {
            // Convert blank lines to XML tags before translation
            const textWithTags = text.replace(/\n\n+/g, (match) => {
              const blankLineCount = match.length;
              const blankLinePairs = Math.floor(blankLineCount / 2);
              const hasOddNewline = blankLineCount % 2 === 1;
              // Each \n\n becomes <blank-line/>
              // If odd count (e.g., \n\n\n), preserve trailing \n
              return FALLBACK_TAG.repeat(blankLinePairs) + (hasOddNewline ? '\n' : '');
            });

            // Translate single segment WITHOUT retry (to avoid infinite recursion)
            const requestBody = new URLSearchParams();
            requestBody.append('text', textWithTags);

            if (sourceLang && sourceLang !== '') {
              requestBody.append('source_lang', sourceLang);
            }
            requestBody.append('target_lang', targetLang);

            if (betaLanguagesEnabled) {
              requestBody.append('enable_beta_languages', '1');
            }
            requestBody.append('tag_handling', 'xml');
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

                // Restore XML tags to blank lines
                if (translated.includes(FALLBACK_TAG)) {
                  translated = translated.replace(
                    /<blank-line\/>(\n)?/g,
                    (match, trailingNewline) => {
                      const tagCount = (match.match(/<blank-line\/>/g) || []).length;
                      return '\n\n'.repeat(tagCount) + (trailingNewline || '');
                    }
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
