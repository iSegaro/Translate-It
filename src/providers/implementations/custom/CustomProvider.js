// src/core/providers/CustomProvider.js
import { BaseProvider } from "@/providers/core/BaseProvider.js";
import {
  getCustomApiUrlAsync,
  getCustomApiKeyAsync,
  getCustomApiModelAsync,
} from "@/config.js";
import { buildPrompt } from "@/utils/promptBuilder.js";

export class CustomProvider extends BaseProvider {
  static type = "api";
  static description = "Custom OpenAI compatible";
  static displayName = "Custom Provider";
  constructor() {
    super("Custom");
  }

  async translate(text, sourceLang, targetLang, translateMode, originalSourceLang = 'English', originalTargetLang = 'Farsi') {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

    const [apiUrl, apiKey, model] = await Promise.all([
      getCustomApiUrlAsync(),
      getCustomApiKeyAsync(),
      getCustomApiModelAsync(),
    ]);

    // Validate configuration
    this._validateConfig(
      { apiUrl, apiKey },
      ["apiUrl", "apiKey"],
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
        model: model, // مدل باید توسط کاربر مشخص شود
        messages: [{ role: "user", content: prompt }],
      }),
    };

    return this._executeApiCall({
      url: apiUrl,
      fetchOptions,
      extractResponse: (data) => data?.choices?.[0]?.message?.content,
      context: `${this.providerName.toLowerCase()}-translation`,
    });
  }
}