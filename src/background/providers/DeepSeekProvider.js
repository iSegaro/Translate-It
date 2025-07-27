// src/core/providers/DeepSeekProvider.js
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import {
  CONFIG,
  getDeepSeekApiKeyAsync,
  getDeepSeekApiModelAsync,
} from "../../config.js";
import { buildPrompt } from "../../utils/promptBuilder.js";

export class DeepSeekProvider extends BaseTranslationProvider {
  constructor() {
    super("DeepSeek");
  }

  async translate(text, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

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
      translateMode
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
    });
  }
}