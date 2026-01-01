// src/features/translation/providers/DeepLTranslate.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import {
  getDeeplApiKeyAsync,
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
    super("DeepLTranslate");
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
   * Get API endpoint based on user's tier setting (Free/Pro)
   * @returns {Promise<string>} API endpoint URL
   */
  async _getApiEndpoint() {
    const tier = await getDeeplApiTierAsync();
    return tier === 'pro'
      ? 'https://api.deepl.com/v2/translate'
      : 'https://api-free.deepl.com/v2/translate';
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

    // Filter out empty or whitespace-only texts (DeepL rejects them)
    const validTexts = chunkTexts.filter(text => text && text.trim().length > 0);

    if (validTexts.length === 0) {
      logger.warn('[DeepL] No valid texts to translate after filtering');
      return chunkTexts.map(() => '');
    }

    if (validTexts.length < chunkTexts.length) {
      logger.debug(`[DeepL] Filtered ${chunkTexts.length - validTexts.length} empty/whitespace texts`);
    }

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

    // Build request body with valid texts only
    const requestBody = new URLSearchParams();
    validTexts.forEach(text => requestBody.append('text', text));

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
        url: await this._getApiEndpoint(),
        fetchOptions: {
          method: "POST",
          headers: {
            "Authorization": `DeepL-Auth-Key ${await getDeeplApiKeyAsync()}`,
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

          // Validate segment count (should match valid texts, not original chunkTexts)
          if (validTranslations.length !== validTexts.length) {
            logger.warn('[DeepL] Segment count mismatch:', {
              expected: validTexts.length,
              received: validTranslations.length
            });
          }

          // Map translations back to original chunkTexts order
          // Fill in empty strings for filtered texts
          const result = [];
          let validIndex = 0;

          for (let i = 0; i < chunkTexts.length; i++) {
            const text = chunkTexts[i];
            if (text && text.trim().length > 0) {
              // This text was translated
              result.push(validTranslations[validIndex] || '');
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
        logger.warn(`[DeepL] HTTP 400 error with ${validTexts.length} segments, retrying with smaller chunks (attempt ${retryAttempt + 1}/5)`);

        // Split into smaller chunks and retry SEQUENTIALLY (not parallel)
        // DeepL Free API has issues with concurrent requests
        const midPoint = Math.ceil(validTexts.length / 2);
        const firstHalf = chunkTexts.slice(0, midPoint);
        const secondHalf = chunkTexts.slice(midPoint);

        let firstResult, secondResult;

        try {
          firstResult = await this._translateChunk(firstHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch (firstError) {
          logger.warn(`[DeepL] First half failed, returning original texts for ${firstHalf.length} segments`);
          firstResult = firstHalf;
        }

        try {
          secondResult = await this._translateChunk(secondHalf, sourceLang, targetLang, translateMode, abortController, retryAttempt + 1, chunkIndex, totalChunks);
        } catch (secondError) {
          logger.warn(`[DeepL] Second half failed, returning original texts for ${secondHalf.length} segments`);
          secondResult = secondHalf;
        }

        return [...firstResult, ...secondResult];
      }

      // Final fallback for HTTP 400: translate each segment individually (sequential)
      // Only do this if we haven't already tried individual translation
      if (error.message?.includes('HTTP 400') && validTexts.length > 1 && retryAttempt >= 5) {
        logger.warn(`[DeepL] Retry attempts exhausted, attempting sequential one-by-one translation for ${validTexts.length} segments`);

        const results = [];
        let successCount = 0;

        for (let i = 0; i < chunkTexts.length; i++) {
          const text = chunkTexts[i];
          // Skip empty texts
          if (!text || text.trim().length === 0) {
            results.push('');
            continue;
          }

          try {
            // Translate single segment WITHOUT retry (to avoid infinite recursion)
            const requestBody = new URLSearchParams();
            requestBody.append('text', text);

            if (sourceLang && sourceLang !== '') {
              requestBody.append('source_lang', sourceLang);
            }
            requestBody.append('target_lang', targetLang);

            if (betaLanguagesEnabled) {
              requestBody.append('enable_beta_languages', '1');
            }
            requestBody.append('split_sentences', 'nonewlines');
            requestBody.append('preserve_formatting', '1');

            const result = await this._executeWithErrorHandling({
              url: await this._getApiEndpoint(),
              fetchOptions: {
                method: "POST",
                headers: {
                  "Authorization": `DeepL-Auth-Key ${await getDeeplApiKeyAsync()}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: requestBody,
              },
              extractResponse: (data) => {
                if (!data?.translations || !Array.isArray(data.translations)) {
                  return text; // Return original on error
                }
                return data.translations[0]?.text || text;
              },
              context,
              abortController,
            });

            results.push(result || text);
            successCount++;
            logger.debug(`[DeepL] Sequential fallback: segment ${i + 1}/${chunkTexts.length} translated`);
          } catch (singleError) {
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
