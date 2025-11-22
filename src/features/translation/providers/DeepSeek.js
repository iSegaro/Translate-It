// src/core/providers/DeepSeekProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getDeepSeekApiKeyAsync,
  getDeepSeekApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'DeepSeek');

export class DeepSeekProvider extends BaseAIProvider {
  static type = "ai";
  static description = "DeepSeek AI";
  static displayName = "DeepSeek";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Conservative settings for DeepSeek
  static supportsStreaming = true; // Enable streaming for segment-based real-time translation
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25;
  static maxComplexity = 400;
  static supportsImageTranslation = false;
  
  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super("DeepSeek");
  }

  _getLangCode(lang) {
    // DeepSeek works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiKey, model] = await Promise.all([
      getDeepSeekApiKeyAsync(),
      getDeepSeekApiModelAsync(),
    ]);

    logger.info(`[DeepSeek] Using model: ${model || 'deepseek-chat'}`);
    logger.info(`[DeepSeek] Starting translation: ${text.length} chars`);

    // Validate configuration
    this._validateConfig(
      { apiKey },
      ["apiKey"],
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
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    };

    const result = await this._executeApiCall({
      url: CONFIG.DEEPSEEK_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    logger.info(`[DeepSeek] Translation completed successfully`);
    return result;
  }
}