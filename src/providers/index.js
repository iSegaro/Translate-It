// src/providers/index.js - Main provider module exports
// NOTE: All providers now live in src/background/providers/

// Re-export from background providers for compatibility
export { TranslationProviderFactory } from "../background/providers/TranslationProviderFactory.js";

// Individual provider implementations from background
export { GoogleTranslateProvider } from "../background/providers/GoogleTranslateProvider.js";
export { BingTranslateProvider } from "../background/providers/BingTranslateProvider.js";
export { YandexTranslateProvider } from "../background/providers/YandexTranslateProvider.js";
export { GeminiProvider } from "../background/providers/GeminiProvider.js";
export { OpenAIProvider } from "../background/providers/OpenAIProvider.js";
export { OpenRouterProvider } from "../background/providers/OpenRouterProvider.js";
export { DeepSeekProvider } from "../background/providers/DeepSeekProvider.js";
export { WebAIProvider } from "../background/providers/WebAIProvider.js";
export { CustomProvider } from "../background/providers/CustomProvider.js";
export { BrowserTranslateProvider } from "../background/providers/BrowserTranslateProvider.js";
export { BaseTranslationProvider } from "../background/providers/BaseTranslationProvider.js";
