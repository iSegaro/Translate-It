// src/core/ProviderRegistry.js
import { logME } from "../utils/helpers.js";

/**
 * Centralized registry for all translation providers
 * Single source of truth for provider metadata and availability
 */
export class ProviderRegistry {
  static providers = [
    {
      id: "google",
      name: "Google Translate",
      displayName: "Google Translate",
      icon: "google.svg",
      description: "Free Google Translate service. No API key required.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: false,
      needsUrl: false,
      category: "free"
    },
    {
      id: "gemini",
      name: "Gemini",
      displayName: "Google Gemini",
      icon: "gemini.svg", 
      description: "Google's advanced AI model with thinking capabilities.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: true,
      needsUrl: false,
      category: "ai"
    },
    {
      id: "openai",
      name: "OpenAI",
      displayName: "OpenAI GPT",
      icon: "openai.svg",
      description: "OpenAI's ChatGPT models for high-quality translations.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: true,
      needsUrl: false,
      category: "ai"
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      displayName: "OpenRouter",
      icon: "openrouter.svg",
      description: "Access multiple AI models through OpenRouter platform.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"], 
        minVersion: null,
        features: []
      },
      needsApiKey: true,
      needsUrl: false,
      category: "ai"
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      displayName: "DeepSeek AI",
      icon: "deepseek.svg",
      description: "DeepSeek's reasoning AI models for accurate translations.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: true,
      needsUrl: false,
      category: "ai"
    },
    {
      id: "browserapi", 
      name: "Browser API",
      displayName: "Chrome Translation",
      icon: "chrome-translate.svg",
      description: "Built-in Chrome translation API. Requires Chrome 138+ and works offline.",
      requirements: {
        browsers: ["chrome"],
        minVersion: "138",
        features: ["Translator", "LanguageDetector"]
      },
      needsApiKey: false,
      needsUrl: false,
      category: "free"
    },
    {
      id: "webai",
      name: "WebAI",
      displayName: "WebAI (Local Server)",
      icon: "webai.svg",
      description: "Local AI server for private translations.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: false,
      needsUrl: true,
      category: "local"
    },
    {
      id: "custom",
      name: "Custom",
      displayName: "Custom API",
      icon: "custom.svg",
      description: "Any OpenAI-compatible API service.",
      requirements: {
        browsers: ["chrome", "firefox", "safari", "edge"],
        minVersion: null,
        features: []
      },
      needsApiKey: true,
      needsUrl: true,
      category: "custom"
    }
  ];

  /**
   * Get all providers
   * @returns {Array} All provider definitions
   */
  static getAllProviders() {
    return [...this.providers];
  }

  /**
   * Get provider by ID
   * @param {string} id - Provider ID
   * @returns {Object|null} Provider definition or null if not found
   */
  static getProvider(id) {
    return this.providers.find(provider => provider.id === id) || null;
  }

  /**
   * Get providers available for current browser
   * @param {string} [browserName] - Browser name (auto-detected if not provided)
   * @returns {Array} Available providers for the browser
   */
  static getAvailableProviders(browserName = null) {
    const browser = browserName || this._detectBrowser();
    logME(`[ProviderRegistry] Detecting available providers for browser: ${browser}`);
    
    return this.providers.filter(provider => {
      // Check browser compatibility
      if (!provider.requirements.browsers.includes(browser)) {
        logME(`[ProviderRegistry] Provider ${provider.id} not compatible with ${browser}`);
        return false;
      }

      // Check browser version if required
      if (provider.requirements.minVersion && browser === 'chrome') {
        const isVersionSupported = this._checkChromeVersion(provider.requirements.minVersion);
        if (!isVersionSupported) {
          logME(`[ProviderRegistry] Provider ${provider.id} requires Chrome ${provider.requirements.minVersion}+`);
          return false;
        }
      }

      // Check required features (for Chrome Translation API)
      if (provider.requirements.features.length > 0) {
        const hasFeatures = this._checkBrowserFeatures(provider.requirements.features);
        if (!hasFeatures) {
          logME(`[ProviderRegistry] Provider ${provider.id} missing required features: ${provider.requirements.features.join(', ')}`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get providers by category
   * @param {string} category - Provider category (free, ai, local, custom)
   * @returns {Array} Providers in the specified category
   */
  static getProvidersByCategory(category) {
    return this.providers.filter(provider => provider.category === category);
  }

  /**
   * Check if provider is available in current environment
   * @param {string} providerId - Provider ID to check
   * @returns {boolean} True if provider is available
   */
  static isProviderAvailable(providerId) {
    const availableProviders = this.getAvailableProviders();
    return availableProviders.some(provider => provider.id === providerId);
  }

  /**
   * Get fallback provider if current provider is not available
   * @param {string} currentProviderId - Current provider ID
   * @returns {string} Fallback provider ID
   */
  static getFallbackProvider(currentProviderId) {
    if (this.isProviderAvailable(currentProviderId)) {
      return currentProviderId;
    }

    // Fallback priority: google -> first available
    const availableProviders = this.getAvailableProviders();
    const googleProvider = availableProviders.find(p => p.id === 'google');
    
    if (googleProvider) {
      return 'google';
    }
    
    return availableProviders.length > 0 ? availableProviders[0].id : 'google';
  }

  /**
   * Detect current browser
   * @private
   * @returns {string} Browser name
   */
  static _detectBrowser() {
    if (typeof navigator === 'undefined') {
      return 'chrome'; // Default for extension environment
    }

    const userAgent = navigator.userAgent.toLowerCase();
    
    if (userAgent.includes('firefox')) {
      return 'firefox';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      return 'safari';
    } else if (userAgent.includes('edge')) {
      return 'edge';
    } else {
      return 'chrome'; // Default fallback (includes Chromium-based browsers)
    }
  }

  /**
   * Check Chrome version compatibility
   * @private
   * @param {string} minVersion - Minimum required version
   * @returns {boolean} True if version is supported
   */
  static _checkChromeVersion(minVersion) {
    if (typeof navigator === 'undefined') {
      return true; // Assume compatibility in extension environment
    }

    const match = navigator.userAgent.match(/Chrome\/(\d+)/);
    if (!match) {
      return false;
    }

    const currentVersion = parseInt(match[1], 10);
    const requiredVersion = parseInt(minVersion, 10);
    
    return currentVersion >= requiredVersion;
  }

  /**
   * Check if required browser features are available
   * @private
   * @param {Array<string>} features - Required features
   * @returns {boolean} True if all features are available
   */
  static _checkBrowserFeatures(features) {
    if (typeof globalThis === 'undefined') {
      return false;
    }

    return features.every(feature => {
      const isAvailable = typeof globalThis[feature] !== 'undefined';
      logME(`[ProviderRegistry] Feature ${feature} available: ${isAvailable}`);
      return isAvailable;
    });
  }

  /**
   * Register a new provider (for extensions or plugins)
   * @param {Object} providerConfig - Provider configuration
   */
  static registerProvider(providerConfig) {
    const existingIndex = this.providers.findIndex(p => p.id === providerConfig.id);
    
    if (existingIndex >= 0) {
      this.providers[existingIndex] = { ...this.providers[existingIndex], ...providerConfig };
      logME(`[ProviderRegistry] Updated provider: ${providerConfig.id}`);
    } else {
      this.providers.push(providerConfig);
      logME(`[ProviderRegistry] Registered new provider: ${providerConfig.id}`);
    }
  }

  /**
   * Get provider validation rules for UI
   * @param {string} providerId - Provider ID
   * @returns {Object} Validation rules
   */
  static getProviderValidation(providerId) {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return {};
    }

    return {
      needsApiKey: provider.needsApiKey,
      needsUrl: provider.needsUrl,
      requirements: provider.requirements
    };
  }
}