// src/core/providers/OpenRouterProvider.js
import { getBrowser } from "@/utils/browser-polyfill.js";
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import {
  CONFIG,
  getOpenRouterApiKeyAsync,
  getOpenRouterApiModelAsync,
} from "../../config.js";
import { buildPrompt } from "../../utils/promptBuilder.js";

export class OpenRouterProvider extends BaseTranslationProvider {
  constructor() {
    super("OpenRouter");
  }

  async translate(text, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

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
      translateMode
    );

    const fetchOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": getBrowser().runtime.getURL("/"),
        "X-Title": getBrowser().runtime.getManifest().name,
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
    });
  }
}
