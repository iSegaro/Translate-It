// src/core/providers/OpenRouterProvider.js
import browser from 'webextension-polyfill';
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  CONFIG,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'OpenRouter');

export class OpenRouterProvider extends BaseAIProvider {
  static type = "ai";
  static description = "OpenRouter API";
  static displayName = "OpenRouter";
  static reliableJsonMode = true;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Flexible settings for multi-model support
  static supportsStreaming = true;
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 12; // Conservative for multi-model support
  static maxComplexity = 250;
  static supportsImageTranslation = true; // Depends on selected model
  
  // Batch processing strategy
  static batchStrategy = 'numbered'; // Uses numbered format for batch translation

  constructor() {
    super("OpenRouter");
  }

  _getLangCode(lang) {
    // OpenRouter works well with full language names, no mapping needed
    return LanguageSwappingService._normalizeLangValue(lang);
  }

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiKey, model] = await Promise.all([
      getOpenRouterApiKeyAsync(),
      getOpenRouterApiModelAsync(),
    ]);

    logger.info(`[OpenRouter] Using model: ${model || 'openai/gpt-3.5-turbo'}`);
    logger.info(`[OpenRouter] Starting translation: ${text.length} chars`);

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
        "HTTP-Referer": browser.runtime.getURL("/"),
        "X-Title": browser.runtime.getManifest().name,
      },
      body: JSON.stringify({
        model: model || "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }],
      }),
    };

    const result = await this._executeApiCall({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    logger.info(`[OpenRouter] Translation completed successfully`);
    return result;
  }
}