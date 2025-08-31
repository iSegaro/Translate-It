// src/providers/index.js
// Central provider exports following project architecture

export { providerRegistry as ProviderRegistry } from "./ProviderRegistry.js";
export { ProviderFactory } from "./ProviderFactory.js";
export { BaseProvider } from "./BaseProvider.js";

// Provider implementations exports
export { GoogleTranslateProvider } from "./GoogleTranslate.js";
export { GeminiProvider } from "./GoogleGemini.js";
export { OpenAIProvider } from "./OpenAI.js";
export { OpenRouterProvider } from "./OpenRouter.js";
export { BingTranslateProvider } from "./BingTranslate.js";
export { browserTranslateProvider } from "./BrowserAPI.js";
export { DeepSeekProvider } from "./DeepSeek.js";
export { WebAIProvider } from "./WebAI.js";
export { CustomProvider } from "./CustomProvider.js";
export { YandexTranslateProvider } from "./YandexTranslate.js";

// Registration function
export { registerAllProviders } from "./register-providers.js";
