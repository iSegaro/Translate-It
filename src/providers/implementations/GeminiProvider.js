// src/core/providers/GeminiProvider.js
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import {
  CONFIG,
  getApiKeyAsync,
  getApiUrlAsync,
  getGeminiModelAsync,
  getGeminiThinkingEnabledAsync,
} from "../../config.js";
import { buildPrompt } from "../../utils/promptBuilder.js";
import { logME } from "../../utils/helpers.js";

export class GeminiProvider extends BaseTranslationProvider {
  constructor() {
    super("Gemini");
  }

  async translate(text, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const [apiKey, geminiModel, thinkingEnabled] = await Promise.all([
      getApiKeyAsync(),
      getGeminiModelAsync(),
      getGeminiThinkingEnabledAsync(),
    ]);

    // Build API URL based on selected model
    let apiUrl;
    if (geminiModel === "custom") {
      apiUrl = await getApiUrlAsync(); // Use custom URL from user input
    } else {
      // Use predefined URL for selected model
      const modelConfig = CONFIG.GEMINI_MODELS?.find(
        (m) => m.value === geminiModel
      );
      apiUrl = modelConfig?.url || CONFIG.API_URL; // Fallback to default
    }

    // Validate configuration
    this._validateConfig(
      { apiKey, apiUrl },
      ["apiKey", "apiUrl"],
      `${this.providerName.toLowerCase()}-translation`
    );

    logME(`[${this.providerName}] translate input text:`, text);
    const prompt = await buildPrompt(
      text,
      sourceLang,
      targetLang,
      translateMode
    );
    logME(`[${this.providerName}] translate built prompt:`, prompt);

    // Determine thinking budget based on model and user settings
    let requestBody = { contents: [{ parts: [{ text: prompt }] }] };

    // Add thinking parameter for supported models
    const modelConfig = CONFIG.GEMINI_MODELS?.find(
      (m) => m.value === geminiModel
    );
    if (modelConfig?.thinking?.supported) {
      if (modelConfig.thinking.controllable) {
        // For controllable models (2.5 Flash, 2.5 Flash Lite)
        if (thinkingEnabled) {
          requestBody.generationConfig = {
            thinkingConfig: { thinkingBudget: -1 }, // Enable dynamic thinking
          };
        } else {
          requestBody.generationConfig = {
            thinkingConfig: { thinkingBudget: 0 }, // Disable thinking
          };
        }
      } else if (modelConfig.thinking.defaultEnabled) {
        // For non-controllable models with thinking enabled by default (2.5 Pro)
        requestBody.generationConfig = {
          thinkingConfig: { thinkingBudget: -1 }, // Always enabled
        };
      }
    }

    const url = `${apiUrl}?key=${apiKey}`;
    const fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    };

    const context = `${this.providerName.toLowerCase()}-translation`;
    logME(`[${this.providerName}] about to call _executeApiCall with:`, {
      url: url.replace(/key=[^&]+/, "key=***"),
      context: context,
    });

    try {
      const result = await this._executeApiCall({
        url,
        fetchOptions,
        extractResponse: (data) =>
          data?.candidates?.[0]?.content?.parts?.[0]?.text,
        context: context,
      });

      logME(
        `[${this.providerName}] _executeApiCall completed with result:`,
        result
      );
      return result;
    } catch (error) {
      // If thinking-related error occurs, retry without thinking config
      if (
        error.message &&
        error.message.includes("thinkingBudget") &&
        requestBody.generationConfig?.thinkingConfig
      ) {
        logME(
          `[${this.providerName}] thinking parameter not supported, retrying without thinking...`
        );

        // Remove thinking config and retry
        delete requestBody.generationConfig;
        const fallbackFetchOptions = {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        };

        const fallbackResult = await this._executeApiCall({
          url,
          fetchOptions: fallbackFetchOptions,
          extractResponse: (data) =>
            data?.candidates?.[0]?.content?.parts?.[0]?.text,
          context: `${context}-fallback`,
        });

        logME(
          `[${this.providerName}] fallback _executeApiCall completed with result:`,
          fallbackResult
        );
        return fallbackResult;
      }

      logME(
        `[${this.providerName}] _executeApiCall failed with error:`,
        error
      );
      throw error;
    }
  }
}