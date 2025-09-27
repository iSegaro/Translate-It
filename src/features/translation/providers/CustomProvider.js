// src/core/providers/CustomProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeyAsync,
  getCustomApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'CustomProvider');

export class CustomProvider extends BaseAIProvider {
  static type = "ai";
  static description = "Custom OpenAI compatible";
  static displayName = "Custom Provider";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Safe defaults for unknown APIs
  static supportsStreaming = true; // Enable streaming for segment-based real-time translation
  static preferredBatchStrategy = 'fixed';
  static optimalBatchSize = 10; // Conservative batch size
  static maxComplexity = 200;
  static supportsImageTranslation = false; // Conservative default
  
  // Batch processing strategy
  static batchStrategy = 'numbered'; // Uses numbered format for batch translation

  constructor() {
    super("Custom");
  }

  _getLangCode(lang) {
    // Custom provider works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiUrl, apiKey, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeyAsync(),
      getCustomApiModelAsync(),
    ]);

    logger.info(`[Custom] Using model: ${model}`);
    logger.info(`[Custom] Starting translation: ${text.length} chars`);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiKey },
      ["apiUrl", "apiKey"],
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
        model: model, // مدل باید توسط کاربر مشخص شود
        messages: [{ role: "user", content: prompt }],
      }),
    };

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    logger.info(`[Custom] Translation completed successfully`);
    return result;
  }
}