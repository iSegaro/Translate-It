// src/providers/index.js - Main provider module exports

// Registry exports
export { ProviderRegistry } from "./registry/index.js";

// Factory exports  
export { TranslationProviderFactory, translationProviderFactory } from "./factory/index.js";

// Individual provider implementations (no barrel export to avoid circular dependencies)
export { GoogleTranslateProvider } from "./implementations/GoogleTranslateProvider.js";
export { BingTranslateProvider } from "./implementations/BingTranslateProvider.js";
export { YandexTranslateProvider } from "./implementations/YandexTranslateProvider.js";
export { GeminiProvider } from "./implementations/GeminiProvider.js";
export { OpenAIProvider } from "./implementations/OpenAIProvider.js";
export { OpenRouterProvider } from "./implementations/OpenRouterProvider.js";
export { DeepSeekProvider } from "./implementations/DeepSeekProvider.js";
export { WebAIProvider } from "./implementations/WebAIProvider.js";
export { CustomProvider } from "./implementations/CustomProvider.js";
export { BrowserTranslateProvider } from "./implementations/BrowserTranslateProvider.js";
export { BaseTranslationProvider } from "./implementations/BaseTranslationProvider.js";