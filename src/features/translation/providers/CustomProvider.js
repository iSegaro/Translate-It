// src/core/providers/CustomProvider.js
import { BaseAIProvider } from "@/features/translation/providers/BaseAIProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeyAsync,
  getCustomApiModelAsync,
} from "@/shared/config/config.js";
import { buildPrompt } from "@/features/translation/utils/promptBuilder.js";
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
  static preferredBatchStrategy = 'smart';
  static optimalBatchSize = 25; // Conservative batch size
  static maxComplexity = 400;
  static supportsImageTranslation = false; // Conservative default

  // Batch processing strategy - Use JSON like Gemini for better compatibility
  static batchStrategy = 'json'; // Uses JSON format for batch translation

  constructor() {
    super("Custom");
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
    await this._validateConfig(
      { apiUrl, apiKey },
      ["apiUrl", "apiKey"],
      `${this.providerName.toLowerCase()}-translation`
    );

    // Check if text is already a batch prompt (like Gemini does)
    const prompt = text.includes('Translate the following')
      ? text
      : await buildPrompt(
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

    // CRITICAL FIX: Handle single segment JSON arrays properly
    // When we receive ```json\n["translated text"]\n``` or ["translated text"] for single segments, extract the text content
    let processedResult = result;

    if (result && typeof result === 'string') {
      let jsonString = null;

      // First try to find JSON array in markdown code blocks
      const markdownMatch = result.match(/```json\s*([\s\S]*?)\s*```/);
      if (markdownMatch) {
        jsonString = markdownMatch[1].trim();
      } else {
        // Try to find direct JSON array (without markdown)
        const directMatch = result.match(/^\s*\[([\s\S]*)\]\s*$/);
        if (directMatch) {
          // Reconstruct the JSON string for parsing
          jsonString = `[${directMatch[1]}]`;
        }
      }

      if (jsonString) {
        try {
          const parsed = JSON.parse(jsonString);

          if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
            logger.debug(`[Custom] Single segment JSON array detected, extracting text properly`);
            processedResult = parsed[0];
          }
        } catch (error) {
          logger.debug(`[Custom] Failed to parse JSON array, using original result:`, error.message);
        }
      }
    }

    logger.info(`[Custom] Translation completed successfully`);
    return processedResult;
  }
}