import { providerRegistry } from "./core/ProviderRegistry.js";
import { GoogleTranslateProvider } from "./implementations/google/GoogleTranslate.js";
import { GeminiProvider } from "./implementations/google/GoogleGemini.js";
import { OpenAIProvider } from "./implementations/openai/OpenAI.js";
import { OpenRouterProvider } from "./implementations/openai/OpenRouter.js";
import { BingTranslateProvider } from "./implementations/microsoft/BingTranslate.js";
import { browserTranslateProvider } from "./implementations/browser/BrowserAPI.js";
import { DeepSeekProvider } from "./implementations/custom/DeepSeek.js";
import { WebAIProvider } from "./implementations/custom/WebAI.js";
import { CustomProvider } from "./implementations/custom/CustomProvider.js";
import { YandexTranslateProvider } from "./implementations/custom/YandexTranslate.js";

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
