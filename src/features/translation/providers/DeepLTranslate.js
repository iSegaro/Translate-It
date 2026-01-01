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
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;

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
    logger.info(`[DeepL] Starting translation: ${chunkTexts.join('').length} chars, ${chunkTexts.length} segments, beta languages: ${betaLanguagesEnabled}`);

    // Build request body
    const requestBody = new URLSearchParams();
    chunkTexts.forEach(text => requestBody.append('text', text));

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
    requestBody.append('split_sentences', '1'); // '1' = on (default)
    requestBody.append('preserve_formatting', '1'); // true

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

        // DeepL returns array of translation objects
        const translatedTexts = data.translations.map(t => t.text || '');

        // Validate segment count
        if (translatedTexts.length !== chunkTexts.length) {
          logger.warn('[DeepL] Segment count mismatch:', {
            expected: chunkTexts.length,
            received: translatedTexts.length
          });
        }

        return translatedTexts;
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
  }
}
