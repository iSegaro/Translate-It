// src/core/providers/OpenRouterProvider.js
import browser from 'webextension-polyfill';
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
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

export class OpenRouterProvider extends BaseProvider {
  static type = "ai";
  static description = "OpenRouter API";
  static displayName = "OpenRouter";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  constructor() {
    super("OpenRouter");
  }

  _getLangCode(lang) {
    // OpenRouter works well with full language names, no mapping needed
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
    const [apiKey, model] = await Promise.all([
      getOpenRouterApiKeyAsync(),
      getOpenRouterApiModelAsync(),
    ]);

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

    return this._executeApiCall({
      url: CONFIG.OPENROUTER_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }
}
