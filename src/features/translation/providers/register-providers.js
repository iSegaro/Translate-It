import { providerRegistry } from "./ProviderRegistry.js";
import { GoogleTranslateProvider } from "./GoogleTranslate.js";
import { GeminiProvider } from "./GoogleGemini.js";
import { OpenAIProvider } from "./OpenAI.js";
import { OpenRouterProvider } from "./OpenRouter.js";
import { BingTranslateProvider } from "./BingTranslate.js";
import { browserTranslateProvider } from "./BrowserAPI.js";
import { DeepSeekProvider } from "./DeepSeek.js";
import { WebAIProvider } from "./WebAI.js";
import { CustomProvider } from "./CustomProvider.js";
import { YandexTranslateProvider } from "./YandexTranslate.js";

export function registerAllProviders() {
  providerRegistry.register("google", GoogleTranslateProvider);
  providerRegistry.register("gemini", GeminiProvider);
  providerRegistry.register("openai", OpenAIProvider);
  providerRegistry.register("openrouter", OpenRouterProvider);
  providerRegistry.register("bing", BingTranslateProvider);
  providerRegistry.register("browser", browserTranslateProvider);
  providerRegistry.register("deepseek", DeepSeekProvider);
  providerRegistry.register("webai", WebAIProvider);
  providerRegistry.register("custom", CustomProvider);
  providerRegistry.register("yandex", YandexTranslateProvider);
}
