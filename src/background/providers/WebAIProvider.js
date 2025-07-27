// src/core/providers/WebAIProvider.js
import { BaseTranslationProvider } from "./BaseTranslationProvider.js";
import {
  getWebAIApiUrlAsync,
  getWebAIApiModelAsync,
} from "../../config.js";
import { buildPrompt } from "../../utils/promptBuilder.js";

export class WebAIProvider extends BaseTranslationProvider {
  constructor() {
    super("WebAI");
  }

  async translate(text, sourceLang, targetLang, translateMode) {
    if (this._isSameLanguage(sourceLang, targetLang)) return null;

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
      translateMode
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
    });

    this.storeSessionContext({ model: apiModel, lastUsed: Date.now() });
    return result;
  }
}