// src/core/providers/WebAIProvider.js
import { BaseProvider } from "@/features/translation/providers/BaseProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { LanguageSwappingService } from "@/features/translation/providers/LanguageSwappingService.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'WebAI');

export class WebAIProvider extends BaseProvider {
  static type = "ai";
  static description = "WebAI service";
  static displayName = "WebAI";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  constructor() {
    super("WebAI");
  }

  _getLangCode(lang) {
    // WebAI works well with full language names, no mapping needed
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
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiModel },
      ["apiUrl", "apiModel"],
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: apiModel,
        images: [],
        reset_session: this.shouldResetSession(),
      }),
    };

    const result = await this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
    });

    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    return result;
  }
}