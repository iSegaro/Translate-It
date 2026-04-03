// src/core/providers/WebAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { ProviderNames } from "@/features/translation/providers/ProviderConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'WebAI');

export class WebAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "WebAI service";
  static displayName = "WebAI";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  // AI Provider capabilities - Standard API service settings
  static supportsStreaming = true; // Enable streaming for segment-based real-time translation
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25; // Moderate batch size for external API
  static maxComplexity = 400;
  static supportsImageTranslation = false; // Depends on model
  
  // Batch processing strategy
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super(ProviderNames.WEBAI);
  }

  
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    // Calculate original character count for stats tracking
    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    logger.info(`[WebAI] Using model: ${apiModel}`);
    logger.info(`[WebAI] Starting translation: ${finalOriginalCharCount} chars`);

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
        max_tokens: 4096, // Ensure enough tokens for batch responses
        reset_session: this.shouldResetSession(),
        // Enable JSON mode for batch translations
        ...(isBatch && { response_format: { type: "json_object" } })
      }),
    };

    // Use unified API request handler
    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      originalCharCount: finalOriginalCharCount,
      extractResponse: (data) =>
        typeof data.response === "string" ? data.response : undefined,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId
    });

    logger.info(`[WebAI] Translation completed successfully`);
    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    
    // Batch translations should return raw text to let the specialized parser handle it.
    return isBatch ? result : this._cleanAIResponse(result);
  }
}
