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
import { AITextProcessor } from "./utils/AITextProcessor.js";
import { ResponseFormat } from "@/shared/config/translationConstants.js";

const logger = getScopedLogger(LOG_COMPONENTS.PROVIDERS, 'WebAI');

export class WebAIProvider extends BaseAIProvider {
  static type = "ai";
  static description = "WebAI service";
  static displayName = "WebAI";
  static reliableJsonMode = false;
  static supportsDictionary = true;
  
  static supportsStreaming = true; 
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25; 
  static maxComplexity = 400;
  static supportsImageTranslation = false; 
  
  static batchStrategy = 'json';

  constructor() {
    super(ProviderNames.WEBAI);
  }

  /**
   * Internal implementation of the WebAI API call.
   * @protected
   */
  async _callAI(systemPrompt, userText, options = {}) {
    const { abortController, sessionId, expectedFormat, isBatch } = options;

    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    this._validateConfig({ apiUrl, apiModel }, ["apiUrl", "apiModel"], `${this.providerName.toLowerCase()}-translation`);

    logger.info(`[WebAI] Using model: ${apiModel}`);

    // WebAI uses a single prompt string instead of separate messages
    const fullPrompt = isBatch 
      ? `${systemPrompt}\n\nJSON data to translate:\n${userText}`
      : await buildPrompt(userText, options.sourceLang, options.targetLang, options.mode, this.constructor.type);

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: fullPrompt,
        model: apiModel,
        images: [],
        max_tokens: 4096,
        reset_session: this.shouldResetSession(),
        // Enforce JSON if requested
        ...(expectedFormat === ResponseFormat.JSON_OBJECT && { response_format: { type: "json_object" } })
      }),
    };

    try {
      const result = await this._executeRequest({
        url: apiUrl,
        fetchOptions,
        charCount: AITextProcessor.calculatePayloadChars(fetchOptions.body),
        originalCharCount: isBatch ? AITextProcessor.estimateOriginalChars(userText) : userText.length,
        extractResponse: (data) => typeof data.response === "string" ? data.response : undefined,
        context: `${this.providerName.toLowerCase()}-translation`,
        abortController,
        sessionId
      });

      this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
      
      return result;
    } catch (error) {
      throw error;
    }
  }
}
