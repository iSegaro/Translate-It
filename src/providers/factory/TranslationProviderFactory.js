// src/providers/factory/TranslationProviderFactory.js
import { ErrorTypes } from "../../error-management/ErrorTypes.js";

/**
 * Factory class for creating translation provider instances
 * Implements singleton pattern to reuse provider instances
 * Uses dynamic imports to avoid circular dependencies
 */
export class TranslationProviderFactory {
  constructor() {
    this.providerInstances = new Map();
    this.providerModules = new Map();
  }

  /**
   * Dynamically import a provider class
   * @param {string} apiType - Type of translation API
   * @returns {Promise<Class>} - Provider class
   */
  async _importProvider(apiType) {
    if (this.providerModules.has(apiType)) {
      return this.providerModules.get(apiType);
    }

    let ProviderClass;
    
    switch (apiType.toLowerCase()) {
      case "google": {
        const module = await import("../implementations/GoogleTranslateProvider.js");
        ProviderClass = module.GoogleTranslateProvider;
        break;
      }
      case "bing": {
        const module = await import("../implementations/BingTranslateProvider.js");
        ProviderClass = module.BingTranslateProvider;
        break;
      }
      case "yandex": {
        const module = await import("../implementations/YandexTranslateProvider.js");
        ProviderClass = module.YandexTranslateProvider;
        break;
      }
      case "gemini": {
        const module = await import("../implementations/GeminiProvider.js");
        ProviderClass = module.GeminiProvider;
        break;
      }
      case "openai": {
        const module = await import("../implementations/OpenAIProvider.js");
        ProviderClass = module.OpenAIProvider;
        break;
      }
      case "openrouter": {
        const module = await import("../implementations/OpenRouterProvider.js");
        ProviderClass = module.OpenRouterProvider;
        break;
      }
      case "deepseek": {
        const module = await import("../implementations/DeepSeekProvider.js");
        ProviderClass = module.DeepSeekProvider;
        break;
      }
      case "webai": {
        const module = await import("../implementations/WebAIProvider.js");
        ProviderClass = module.WebAIProvider;
        break;
      }
      case "custom": {
        const module = await import("../implementations/CustomProvider.js");
        ProviderClass = module.CustomProvider;
        break;
      }
      case "browserapi": {
        const module = await import("../implementations/BrowserTranslateProvider.js");
        ProviderClass = module.BrowserTranslateProvider;
        break;
      }
      default: {
        const err = new Error(`Unsupported translation API type: ${apiType}`);
        err.type = ErrorTypes.API;
        err.context = "translation-provider-factory";
        throw err;
      }
    }

    this.providerModules.set(apiType, ProviderClass);
    return ProviderClass;
  }

  /**
   * Creates or returns existing provider instance based on API type
   * @param {string} apiType - Type of translation API (google, gemini, openai, etc.)
   * @returns {Promise<BaseTranslationProvider>} - Provider instance
   * @throws {Error} - If unsupported API type
   */
  async getProvider(apiType) {
    // Return cached instance if exists
    if (this.providerInstances.has(apiType)) {
      return this.providerInstances.get(apiType);
    }

    // Dynamically import and instantiate provider
    const ProviderClass = await this._importProvider(apiType);
    const provider = new ProviderClass();

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