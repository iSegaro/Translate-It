// src/core/providers/OpenAIProvider.js
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import {
  getOpenAIApiKeyAsync,
  getOpenAIApiUrlAsync,
  getOpenAIModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getPromptBASEScreenCaptureAsync } from "@/shared/config/config.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenAI');


export class OpenAIProvider extends BaseProvider {
  static type = "ai";
  static description = "OpenAI GPT models";
  static displayName = "OpenAI";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  constructor() {
    super("OpenAI");
  }

  _getLangCode(lang) {
    // OpenAI works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  async _batchTranslate(texts, sl, tl, translateMode, engine, messageId, abortController) {
    const { rateLimitManager } = await import("@/features/translation/core/RateLimitManager.js");
    const results = [];
    
    for (let i = 0; i < texts.length; i++) {
      if (engine && engine.isCancelled(messageId)) {
        throw new Error('Translation cancelled');
      }
      
      try {
        const result = await rateLimitManager.executeWithRateLimit(
          this.providerName,
          () => this._translateSingle(texts[i], sl, tl, translateMode),
          `segment-${i + 1}/${texts.length}`
        );
        results.push(result || texts[i]);
      } catch (error) {
        logger.warn(`[${this.providerName}] Segment ${i + 1} failed:`, error);
        results.push(texts[i]); // Return original text on failure
      }
    }
    
    return results;
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode) {
    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-translation`
    );

    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode,
      this.constructor.type
    );

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }

  /**
   * Translate text from image using OpenAI Vision
   * @param {string} imageData - Base64 encoded image data
   * @param {string} sourceLang - Source language
   * @param {string} targetLang - Target language
   * @param {string} translateMode - Translation mode
   * @returns {Promise<string>} - Translated text
   */
  async translateImage(imageData, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const [apiKey, apiUrl, model] = await Promise.all([
      getOpenAIApiKeyAsync(),
      getOpenAIApiUrlAsync(),
      getOpenAIModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-image-translation`
    );

  logger.debug('translateImage called with mode:', translateMode);

    // Build prompt for screen capture translation
    const basePrompt = await getPromptBASEScreenCaptureAsync();
    const prompt = basePrompt
      .replace(/\$_\{TARGET\}/g, targetLang)
      .replace(/\$_\{SOURCE\}/g, sourceLang);

  logger.debug('translateImage built prompt:', prompt);

    // Prepare message with image
    const messages = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt
          },
          {
            type: "image_url",
            image_url: {
              url: imageData
            }
          }
        ]
      }
    ];

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || "gpt-4o",
        messages: messages,
        max_tokens: 1000
      }),
    };

    const context = `${this.providerName.toLowerCase()}-image-translation`;
    logger.debug('about to call _executeApiCall for image translation');

    try {
      const result = await this._executeApiCall({
        url: apiUrl,
        fetchOptions,
        extractResponse: (data) => data?.choices?.[0]?.message?.content,
        context: context,
      });

      logger.info('image translation completed with result:', result
      );
      return result;
    } catch (error) {
      logger.error('image translation failed with error:', error
      );
      throw error;
    }
  }
}