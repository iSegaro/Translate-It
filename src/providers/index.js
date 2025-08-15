// src/providers/index.js
// Central provider exports following project architecture

export { providerRegistry as ProviderRegistry } from "./core/ProviderRegistry.js";
export { ProviderFactory } from "./core/ProviderFactory.js";
export { BaseProvider } from "./core/BaseProvider.js";

// Provider implementations exports
export { GoogleTranslateProvider } from "./implementations/google/GoogleTranslate.js";
export { GeminiProvider } from "./implementations/google/GoogleGemini.js";
export { OpenAIProvider } from "./implementations/openai/OpenAI.js";
export { OpenRouterProvider } from "./implementations/openai/OpenRouter.js";
export { BingTranslateProvider } from "./implementations/microsoft/BingTranslate.js";
export { browserTranslateProvider } from "./implementations/browser/BrowserAPI.js";
export { DeepSeekProvider } from "./implementations/custom/DeepSeek.js";
export { WebAIProvider } from "./implementations/custom/WebAI.js";
export { CustomProvider } from "./implementations/custom/CustomProvider.js";
export { YandexTranslateProvider } from "./implementations/custom/YandexTranslate.js";

// Registration function
export { registerAllProviders } from "./register-providers.js";
