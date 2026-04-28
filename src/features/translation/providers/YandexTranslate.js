// src/providers/implementations/YandexTranslateProvider.js
import { BaseTranslateProvider } from "@/features/translation/providers/BaseTranslateProvider.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { AUTO_DETECT_VALUE } from "@/shared/config/constants.js";
import { 
  getYandexTranslateUrlAsync
} from "@/shared/config/config.js";
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";
import { TraditionalTextProcessor } from "./utils/TraditionalTextProcessor.js";
import { TRANSLATION_CONSTANTS } from "@/shared/config/translationConstants.js";
import { ErrorTypes } from "@/shared/error-management/ErrorTypes.js";
import { getProviderLanguageCode } from "@/shared/config/languageConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'YandexTranslate');

export class YandexTranslateProvider extends BaseTranslateProvider {
  static type = "translate";
  static description = "Yandex translation service";
  static displayName = "Yandex Translate";
  static reliableJsonMode = TRANSLATION_CONSTANTS.RELIABLE_JSON_MODE.YANDEX;
  static supportsDictionary = TRANSLATION_CONSTANTS.SUPPORTS_DICTIONARY.YANDEX;
  static mainUrl = "https://translate.yandex.net/api/v1/tr.json/translate";
  static detectUrl = "https://translate.yandex.net/api/v1/tr.json/detect";
  
  // BaseTranslateProvider capabilities (Default values)
  // NOTE: Character limits and chunk sizes are now dynamically managed 
  // by ProviderConfigurations.js based on the active Optimization Level.
  static supportsStreaming = TRANSLATION_CONSTANTS.SUPPORTS_STREAMING.YANDEX;
  static chunkingStrategy = TRANSLATION_CONSTANTS.CHUNKING_STRATEGIES.YANDEX;
  static characterLimit = TRANSLATION_CONSTANTS.CHARACTER_LIMITS.YANDEX;
  static maxChunksPerBatch = TRANSLATION_CONSTANTS.MAX_CHUNKS_PER_BATCH.YANDEX;

  constructor() {
    super(ProviderNames.YANDEX_TRANSLATE);
  }

  _getLangCode(lang) {
    if (!lang || lang === AUTO_DETECT_VALUE) return 'auto';
    return getProviderLanguageCode(lang, 'YANDEX');
  }

  _generateUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }).replace(/-/g, '');
  }

  /**
   * Translate a single chunk of texts using Yandex's API
   * @param {string[]} chunkTexts - Texts in this chunk
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @param {AbortController} abortController - Cancellation controller
   * @param {number} retryAttempt - Current retry attempt
   * @param {number} segmentCount - Number of segments in this chunk
   * @param {number} chunkIndex - Current chunk index
   * @param {number} totalChunks - Total number of chunks
   * @param {Object} options - Additional options (sessionId, originalCharCount)
   * @returns {Promise<string[]>} - Translated texts for this chunk
   */
  async _translateChunk(chunkTexts, sourceLang, targetLang, translateMode, abortController, retryAttempt, segmentCount, chunkIndex, totalChunks, options = {}) {
    const context = `${this.providerName.toLowerCase()}-translate-chunk`;
    
    const sl = this._getLangCode(sourceLang);
    const tl = this._getLangCode(targetLang);
    
    // Yandex expects 'target' or 'source-target'
    const lang = sl === "auto" ? tl : `${sl}-${tl}`;
    logger.debug(`Yandex: Built lang parameter: '${lang}' from source='${sl}' target='${tl}'`);

    // Add key info log for translation start
    const charCount = TraditionalTextProcessor.calculateTraditionalCharCount(chunkTexts);
    logger.info(`[Yandex] Starting translation: ${charCount} chars`);

    const uuid = this._generateUuid();
    const formData = new URLSearchParams();
    formData.append('lang', lang);
    
    // Extract text from objects (Select Element) to prevent technical artifacts
    chunkTexts.forEach(t => {
      const text = typeof t === 'object' ? (t.t || t.text || "") : (t || "");
      formData.append('text', String(text));
    });

    const apiUrl = await getYandexTranslateUrlAsync();
    const url = new URL(apiUrl);
    url.searchParams.set("id", `${uuid}-0-0`);
    url.searchParams.set("srv", "android");

    const originalCharCount = charCount;

    const result = await this._executeRequest({
      url: url.toString(),
      fetchOptions: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": navigator.userAgent,
        },
        body: formData,
      },
      extractResponse: (data) => {
        if (!data || data.code !== 200 || !data.text || !Array.isArray(data.text) || data.text.length !== chunkTexts.length) {
          logger.error('Yandex API returned invalid or mismatched response for a chunk', data);
          const err = new Error(`Yandex API error (Code: ${data?.code || 'unknown'})`);
          err.type = ErrorTypes.API_RESPONSE_INVALID;
          err.statusCode = data?.code;
          throw err;
        }

        // Capture detected source language from 'lang' field (format: "en-fa")
        if (data.lang && typeof data.lang === 'string') {
          this._setDetectedLanguage(data.lang.split('-')[0]);
        }

        return data.text;
      },
      context,
      abortController,
      charCount: originalCharCount,
      sessionId: options.sessionId,
      originalCharCount: options.originalCharCount || originalCharCount
    });

    const finalResult = result || chunkTexts.map(() => '');

    // Add completion log for successful translation
    if (finalResult.length > 0) {
      logger.info(`[Yandex] Translation completed successfully`);
    }

    return finalResult;
  }

  async detect_with_yandex(text, hintLangs = []) {
    logger.debug(`Yandex: Detecting language for text: "${text.substring(0, 50)}..."`);

    const uuid = this._generateUuid();
    const url = new URL(YandexTranslateProvider.detectUrl);
    url.searchParams.set("id", `${uuid}-0-0`);
    url.searchParams.set("srv", "android");

    const formData = new URLSearchParams({
      text: text,
      options: "1",
    });

    if (hintLangs.length > 0) {
      formData.append('hint', hintLangs.map(l => this._getLangCode(l)).join(','));
    }

    try {
      const result = await this._executeRequest({
        url: url.toString(),
        fetchOptions: {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": navigator.userAgent,
          },
          body: formData,
        },
        extractResponse: (data) => {
          if (data && data.code === 200 && data.lang) {
            logger.debug(`Yandex: Detected language: ${data.lang}`);
            return { detectedLang: data.lang };
          }
          logger.error("Yandex detect API returned invalid response:", data);
          return undefined;
        },
        context: `${this.providerName.toLowerCase()}-detect`,
      });

      return result?.detectedLang;
    } catch (error) {
      logger.error("Yandex language detection failed:", error);
      throw error;
    }
  }
}
