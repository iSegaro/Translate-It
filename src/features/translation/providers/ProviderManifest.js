/**
 * Provider Manifest - Single Source of Truth for all Translation Providers
 * 
 * This file centralizes identity, metadata, loading logic, and UI display info
 * for every provider. Adding a new provider now only requires adding an entry here.
 */

import { ProviderNames, ProviderRegistryIds, ProviderTypes } from './ProviderConstants.js';

/**
 * Provider Categories for UI grouping
 */
export const ProviderCategories = {
  FREE: "free",
  AI: "ai", 
  LOCAL: "local"
};

/**
 * The Central Manifest
 * Wrapped in a function to enable lazy initialization for better stability
 */
const getRawManifest = () => [
  // --- Group: FREE ---
  {
    id: ProviderRegistryIds.GOOGLE_V2,
    name: ProviderNames.GOOGLE_TRANSLATE_V2,
    displayName: "Google Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "google.png",
    importFunction: () => import("./GoogleTranslateV2Provider.js").then(m => ({ default: m.GoogleTranslateV2Provider })),
    features: ["text", "autoDetect", "bulk", "dictionary"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.EDGE,
    name: ProviderNames.MICROSOFT_EDGE,
    displayName: "Microsoft Translator",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "edge.png",
    importFunction: () => import("./MicrosoftEdgeProvider.js").then(m => ({ default: m.MicrosoftEdgeProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.DEEPL,
    name: ProviderNames.DEEPL_TRANSLATE,
    displayName: "DeepL Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "deepl.png",
    importFunction: () => import("./DeepLTranslate.js").then(m => ({ default: m.DeepLTranslateProvider })),
    features: ["text", "autoDetect", "formality"],
    needsApiKey: true,
    requiredSettings: ['DEEPL_API_KEY'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.YANDEX,
    name: ProviderNames.YANDEX_TRANSLATE,
    displayName: "Yandex Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "yandex.png",
    importFunction: () => import("./YandexTranslate.js").then(m => ({ default: m.YandexTranslateProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.GOOGLE,
    name: ProviderNames.GOOGLE_TRANSLATE,
    displayName: "Google Translate (Classic)",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "google.png",
    importFunction: () => import("./GoogleTranslate.js").then(m => ({ default: m.GoogleTranslateProvider })),
    features: ["text", "autoDetect", "bulk", "dictionary"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.LINGVA,
    name: ProviderNames.LINGVA,
    displayName: "Lingva",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "lingva.png",
    importFunction: () => import("./LingvaProvider.js").then(m => ({ default: m.LingvaProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    requiredSettings: ['LINGVA_API_URL'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.BING,
    name: ProviderNames.BING_TRANSLATE,
    displayName: "Bing Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "bing.png",
    importFunction: () => import("./BingTranslate.js").then(m => ({ default: m.BingTranslateProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },

  // --- Group: AI ---
  {
    id: ProviderRegistryIds.GEMINI,
    name: ProviderNames.GEMINI,
    displayName: "Google Gemini",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "gemini.png",
    importFunction: () => import("./GoogleGemini.js").then(m => ({ default: m.GeminiProvider })),
    features: ["text", "context", "smart", "bulk", "image"],
    needsApiKey: true,
    requiredSettings: ['GEMINI_API_KEY'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.OPENAI,
    name: ProviderNames.OPENAI,
    displayName: "OpenAI GPT",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "openai.png",
    importFunction: () => import("./OpenAI.js").then(m => ({ default: m.OpenAIProvider })),
    features: ["text", "context", "smart", "image"],
    needsApiKey: true,
    requiredSettings: ['OPENAI_API_KEY'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.OPENROUTER,
    name: ProviderNames.OPENROUTER,
    displayName: "OpenRouter",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "openrouter.png",
    importFunction: () => import("./OpenRouter.js").then(m => ({ default: m.OpenRouterProvider })),
    features: ["text", "context", "smart"],
    needsApiKey: true,
    requiredSettings: ['OPENROUTER_API_KEY'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.DEEPSEEK,
    name: ProviderNames.DEEPSEEK,
    displayName: "DeepSeek",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "deepseek.png",
    importFunction: () => import("./DeepSeek.js").then(m => ({ default: m.DeepSeekProvider })),
    features: ["text", "context", "smart", "thinking"],
    needsApiKey: true,
    requiredSettings: ['DEEPSEEK_API_KEY'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.CUSTOM,
    name: ProviderNames.CUSTOM,
    displayName: "OpenAI Compatible",
    type: ProviderTypes.CUSTOM,
    category: ProviderCategories.AI,
    icon: "custom.png",
    importFunction: () => import("./CustomProvider.js").then(m => ({ default: m.CustomProvider })),
    features: ["text", "context", "configurable"],
    needsApiKey: true,
    requiredSettings: ['CUSTOM_API_KEY', 'CUSTOM_API_URL'],
    supported: true,
  },

  // --- Group: LOCAL ---
  {
    id: ProviderRegistryIds.WEBAI,
    name: ProviderNames.WEBAI,
    displayName: "WebAI Local Server",
    type: ProviderTypes.AI,
    category: ProviderCategories.LOCAL,
    icon: "webai.png",
    importFunction: () => import("./WebAI.js").then(m => ({ default: m.WebAIProvider })),
    features: ["text", "context", "offline"],
    needsApiKey: false,
    requiredSettings: ['WEBAI_API_URL'],
    supported: true,
  },
  {
    id: ProviderRegistryIds.BROWSER,
    name: ProviderNames.BROWSER_API,
    displayName: "Browser Translation",
    type: ProviderTypes.NATIVE,
    category: ProviderCategories.LOCAL,
    icon: "chrome-translate.png",
    importFunction: () => import("./BrowserAPI.js").then(m => ({ default: m.browserTranslateProvider })),
    features: ["text", "autoDetect", "offline"],
    needsApiKey: false,
    supported: true,
  },

  // --- Group: DEVELOPMENT ---
  {
    id: ProviderRegistryIds.MOCK,
    name: ProviderNames.MOCK,
    displayName: "Development Mock",
    type: ProviderTypes.MOCK,
    category: ProviderCategories.LOCAL,
    icon: "custom.png",
    importFunction: () => import("./MockProvider.js").then(m => ({ default: m.MockProvider })),
    features: ["text", "context", "smart", "bulk", "streaming"],
    needsApiKey: false,
    supported: true, // Enable it here, we will filter it in the registry
  },
];

let cachedManifest = null;

/**
 * Process manifest to add dynamic i18n keys
 */
export const getProviderManifest = () => {
  if (cachedManifest) return cachedManifest;
  
  cachedManifest = getRawManifest().map(provider => ({
    ...provider,
    titleKey: `provider_${provider.id}_title`,
    descriptionKey: `provider_${provider.id}_description`
  }));
  
  return cachedManifest;
};

// Backward compatibility for existing imports
export const PROVIDER_MANIFEST = getProviderManifest();

/**
 * Helper: Find provider by Registry ID
 */
export const findProviderById = (id) => getProviderManifest().find(p => p.id === id);

/**
 * Helper: Find provider by Provider Name
 */
export const findProviderByName = (name) => getProviderManifest().find(p => p.name === name);

/**
 * Helper: Get all active/supported providers
 */
export const getActiveProviders = () => getProviderManifest().filter(p => p.supported);

