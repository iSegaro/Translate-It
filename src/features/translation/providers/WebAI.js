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
import { AIConversationHelper } from "./utils/AIConversationHelper.js";

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

  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController, isBatch = false, sessionId = null, originalCharCount = 0, contextMetadata = null) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    const finalOriginalCharCount = originalCharCount || (isBatch ? this._estimateOriginalCharsFromJson(text) : text.length);

    logger.info(`[WebAI] Using model: ${apiModel}`);
    logger.info(`[WebAI] Starting translation: ${finalOriginalCharCount} chars`);

    this._validateConfig({ apiUrl, apiModel }, ["apiUrl", "apiModel"], `${this.providerName.toLowerCase()}-translation`);

    let prompt;
    if (isBatch) {
      const { systemPrompt, userText } = await AIConversationHelper.preparePromptAndText(text, sourceLang, targetLang, translateMode, WebAIProvider.type, sessionId, isBatch, contextMetadata);
      prompt = `${systemPrompt}\n\nJSON data to translate:\n${userText}`;
    } else {
      prompt = await buildPrompt(text, sourceLang, targetLang, translateMode, this.constructor.type);
      // Manually add context metadata for non-batch WebAI if needed, but buildPrompt doesn't support it yet
    }

    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: prompt,
        model: apiModel,
        images: [],
        max_tokens: 4096,
        reset_session: this.shouldResetSession(),
        ...(isBatch && { response_format: { type: "json_object" } })
      }),
    };

    const result = await this._executeRequest({
      url: apiUrl,
      fetchOptions,
      originalCharCount: finalOriginalCharCount,
      extractResponse: (data) => typeof data.response === "string" ? data.response : undefined,
      context: `${this.providerName.toLowerCase()}-translation`,
      abortController,
      sessionId
    });

    logger.info(`[WebAI] Translation completed successfully`);
    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    
    return result;
  }
}
