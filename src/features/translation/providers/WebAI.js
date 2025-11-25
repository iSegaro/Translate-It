// src/core/providers/WebAIProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

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
    super("WebAI");
  }

  
  async _translateSingle(text, sourceLang, targetLang, translateMode, abortController) {
    const [apiUrl, apiModel] = await Promise.all([
      getWebAIApiUrlAsync(),
      getWebAIApiModelAsync(),
    ]);

    logger.info(`[WebAI] Using model: ${apiModel}`);
    logger.info(`[WebAI] Starting translation: ${text.length} chars`);

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

    // CRITICAL FIX: Handle single segment JSON arrays properly
    // When we receive ```json\n["translated text"]\n``` for single segments, extract the text content
    let processedResult = result;

    if (result && typeof result === 'string') {
      // Check if this is a JSON array response in markdown
      const jsonMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const jsonString = jsonMatch[1].trim();
          const parsed = JSON.parse(jsonString);

          if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
            logger.debug(`[WebAI] Single segment JSON array detected, extracting text properly`);
            processedResult = parsed[0];
          }
        } catch (error) {
          logger.debug(`[WebAI] Failed to parse JSON array, using original result:`, error.message);
        }
      }
    }

    logger.info(`[WebAI] Translation completed successfully`);
    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    return processedResult;
  }
}