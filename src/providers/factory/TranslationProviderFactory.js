// src/providers/factory/TranslationProviderFactory.js
import {
  GoogleTranslateProvider,
  BingTranslateProvider,
  YandexTranslateProvider,
  GeminiProvider,
  OpenAIProvider,
  OpenRouterProvider,
  DeepSeekProvider,
  WebAIProvider,
  CustomProvider,
  BrowserTranslateProvider,
} from "../implementations/index.js";
import { ErrorTypes } from "../../services/ErrorTypes.js";

/**
 * Factory class for creating translation provider instances
 * Implements singleton pattern to reuse provider instances
 */
export class TranslationProviderFactory {
  constructor() {
    this.providerInstances = new Map();
  }

  /**
   * Creates or returns existing provider instance based on API type
   * @param {string} apiType - Type of translation API (google, gemini, openai, etc.)
   * @returns {BaseTranslationProvider} - Provider instance
   * @throws {Error} - If unsupported API type
   */
  getProvider(apiType) {
    // Return cached instance if exists
    if (this.providerInstances.has(apiType)) {
      return this.providerInstances.get(apiType);
    }

    let provider;
    
    switch (apiType.toLowerCase()) {
      case "google":
        provider = new GoogleTranslateProvider();
        break;
      case "bing":
        provider = new BingTranslateProvider();
        break;
      case "yandex":
        provider = new YandexTranslateProvider();
        break;
      case "gemini":
        provider = new GeminiProvider();
        break;
      case "openai":
        provider = new OpenAIProvider();
        break;
      case "openrouter":
        provider = new OpenRouterProvider();
        break;
      case "deepseek":
        provider = new DeepSeekProvider();
        break;
      case "webai":
        provider = new WebAIProvider();
        break;
      case "custom":
        provider = new CustomProvider();
        break;
      case "browserapi":
        provider = new BrowserTranslateProvider();
        break;
      default: {
        const err = new Error(`Unsupported translation API type: ${apiType}`);
        err.type = ErrorTypes.API;
        err.context = "translation-provider-factory";
        throw err;
      }
    }

    // Cache the provider instance
    this.providerInstances.set(apiType, provider);
    return provider;
  }

  /**
   * Get list of supported provider types
   * @returns {Array<string>} - Array of supported API types
   */
  getSupportedProviders() {
    return [
      "google",
      "bing",
      "yandex",
      "gemini", 
      "openai",
      "openrouter",
      "deepseek",
      "webai",
      "custom",
      "browserapi"
    ];
  }

  /**
   * Check if a provider type is supported
   * @param {string} apiType - API type to check
   * @returns {boolean} - True if supported
   */
  isProviderSupported(apiType) {
    return this.getSupportedProviders().includes(apiType.toLowerCase());
  }

  /**
   * Reset provider instances (useful for testing or configuration changes)
   * @param {string} [apiType] - Specific provider to reset, or all if not specified
   */
  resetProviders(apiType = null) {
    if (apiType) {
      this.providerInstances.delete(apiType);
    } else {
      this.providerInstances.clear();
    }
  }

  /**
   * Reset session context for a specific provider or all providers
   * @param {string} [apiType] - Specific provider to reset session, or all if not specified
   */
  resetSessionContext(apiType = null) {
    if (apiType && this.providerInstances.has(apiType)) {
      this.providerInstances.get(apiType).resetSessionContext();
    } else {
      // Reset all provider sessions
      for (const provider of this.providerInstances.values()) {
        provider.resetSessionContext();
      }
    }
  }
}

// Export singleton instance
export const translationProviderFactory = new TranslationProviderFactory();