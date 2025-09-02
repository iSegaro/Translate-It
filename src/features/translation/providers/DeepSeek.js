// src/core/providers/DeepSeekProvider.js
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
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

export class DeepSeekProvider extends BaseProvider {
  static type = "ai";
  static description = "DeepSeek AI";
  static displayName = "DeepSeek";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  constructor() {
    super("DeepSeek");
  }

  _getLangCode(lang) {
    // DeepSeek works well with full language names, no mapping needed
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
      getDeepSeekApiKeyAsync(),
      getDeepSeekApiModelAsync(),
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
      },
      body: JSON.stringify({
        model: model || "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
      }),
    };

    return this._executeApiCall({
      url: CONFIG.DEEPSEEK_API_URL,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });
  }
}