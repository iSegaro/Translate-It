/**
 * Provider Registry for UI - Static provider information for UI display only
 * Rebuilt version with all supported providers for proper dropdown functionality
 */

/**
 * Provider categories
 */
export const PROVIDER_CATEGORIES = {
  FREE: "free",
  AI: "ai", 
  BROWSER: "browser",
  LOCAL: "local",
  CUSTOM: "custom",
};

/**
 * Complete provider registry with metadata for UI
 */
export const PROVIDER_REGISTRY = [
  {
    id: "google",
    name: "Google Translate",
    description: "Free translation service by Google",
    icon: "providers/google.svg",
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ["text", "autoDetect", "bulk"],
    languages: 100,
    rateLimit: "None",
    quality: "High",
    speed: "Fast",
  },
  {
    id: "yandex",
    name: "Yandex Translate",
    description: "Free translation service by Yandex", 
    icon: "providers/yandex.svg",
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ["text", "autoDetect"],
    languages: 90,
    rateLimit: "None",
    quality: "High",
    speed: "Fast",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "AI-powered translation with context understanding",
    icon: "providers/gemini.svg",
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ["text", "context", "smart", "bulk"],
    languages: 100,
    rateLimit: "API dependent",
    quality: "Very High",
    speed: "Medium",
    models: ["gemini-pro", "gemini-flash"],
  },
  {
    id: "openai",
    name: "OpenAI GPT",
    description: "AI translation using GPT models",
    icon: "providers/openai.svg",
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ["text", "context", "smart"],
    languages: 100,
    rateLimit: "API dependent",
    quality: "Very High", 
    speed: "Medium",
    models: ["gpt-4", "gpt-3.5-turbo"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Access to multiple AI models via OpenRouter",
    icon: "providers/openrouter.svg",
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ["text", "context", "smart"],
    languages: 100,
    rateLimit: "API dependent",
    quality: "Very High",
    speed: "Medium",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek AI models for translation",
    icon: "providers/deepseek.svg",
    category: PROVIDER_CATEGORIES.AI,
    needsApiKey: true,
    supported: true,
    features: ["text", "context", "smart"],
    languages: 100,
    rateLimit: "API dependent",
    quality: "High",
    speed: "Medium",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  {
    id: "webai",
    name: "WebAI Local Server",
    description: "Local server for AI model access",
    icon: "providers/webai.svg",
    category: PROVIDER_CATEGORIES.LOCAL,
    needsApiKey: false,
    supported: true,
    features: ["text", "context", "offline"],
    languages: 100,
    rateLimit: "None",
    quality: "Variable",
    speed: "Variable",
    requirements: "Local WebAI to API server",
  },
  {
    id: "bing",
    name: "Bing Translate", 
    description: "Free translation service by Microsoft",
    icon: "providers/bing.svg",
    category: PROVIDER_CATEGORIES.FREE,
    needsApiKey: false,
    supported: true,
    features: ["text", "autoDetect"],
    languages: 70,
    rateLimit: "None",
    quality: "High",
    speed: "Fast",
  },
  {
    id: "browser",
    name: "Browser Translation",
    description: "Built-in browser translation API (Chrome 138+)",
    icon: "providers/chrome-translate.svg",
    category: PROVIDER_CATEGORIES.BROWSER,
    needsApiKey: false,
    supported: true,
    features: ["text", "autoDetect", "offline"],
    languages: 50,
    rateLimit: "None", 
    quality: "High",
    speed: "Very Fast",
    requirements: "Chrome 138+ or compatible browser",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    description: "Custom OpenAI-compatible API endpoint",  
    icon: "providers/custom.svg",
    category: PROVIDER_CATEGORIES.CUSTOM,
    needsApiKey: true,
    supported: true,
    features: ["text", "context", "configurable"],
    languages: 100,
    rateLimit: "Server dependent",
    quality: "Variable",
    speed: "Variable",
    requirements: "Compatible API endpoint",
  },
];

// For backward compatibility and easy access
const FALLBACK_PROVIDERS = PROVIDER_REGISTRY;

// Export functions for compatibility
export const getProvidersForDropdown = () => FALLBACK_PROVIDERS;
export const getProviderById = (id) => FALLBACK_PROVIDERS.find(p => p.id === id);
export const getSupportedProviders = () => FALLBACK_PROVIDERS;

// Export class for compatibility
export class ProviderRegistry {
  static getAll() {
    return FALLBACK_PROVIDERS;
  }
  
  static getById(id) {
    return FALLBACK_PROVIDERS.find(p => p.id === id);
  }
}

// Default export for compatibility
export default {
  getProvidersForDropdown,
  getProviderById,
  getSupportedProviders,
  ProviderRegistry,
};