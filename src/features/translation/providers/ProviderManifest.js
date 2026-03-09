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
  BROWSER: "browser",
  LOCAL: "local",
  CUSTOM: "custom",
};

/**
 * The Central Manifest
 * Each entry defines everything the system needs to know about a provider.
 */
export const PROVIDER_MANIFEST = [
  {
    id: ProviderRegistryIds.GOOGLE_V2,
    name: ProviderNames.GOOGLE_TRANSLATE_V2,
    displayName: "Google Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "google.png",
    descriptionKey: "googlev2_translate_description",
    titleKey: "googlev2_translate_settings_title",
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
    descriptionKey: "edge_translate_description",
    titleKey: "edge_translate_settings_title",
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
    descriptionKey: "deepl_translate_description",
    titleKey: "deepl_translate_settings_title",
    importFunction: () => import("./DeepLTranslate.js").then(m => ({ default: m.DeepLTranslateProvider })),
    features: ["text", "autoDetect", "formality"],
    needsApiKey: true,
    supported: true,
  },
  {
    id: ProviderRegistryIds.YANDEX,
    name: ProviderNames.YANDEX_TRANSLATE,
    displayName: "Yandex Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "yandex.png",
    descriptionKey: "yandex_translate_description",
    titleKey: "yandex_translate_settings_title",
    importFunction: () => import("./YandexTranslate.js").then(m => ({ default: m.YandexTranslateProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.GEMINI,
    name: ProviderNames.GEMINI,
    displayName: "Google Gemini",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "gemini.png",
    descriptionKey: "gemini_translate_description",
    titleKey: "gemini_settings_title",
    importFunction: () => import("./GoogleGemini.js").then(m => ({ default: m.GeminiProvider })),
    features: ["text", "context", "smart", "bulk", "image"],
    needsApiKey: true,
    supported: true,
  },
  {
    id: ProviderRegistryIds.OPENAI,
    name: ProviderNames.OPENAI,
    displayName: "OpenAI GPT",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "openai.png",
    descriptionKey: "openai_translate_description",
    titleKey: "openai_settings_title",
    importFunction: () => import("./OpenAI.js").then(m => ({ default: m.OpenAIProvider })),
    features: ["text", "context", "smart", "image"],
    needsApiKey: true,
    supported: true,
  },
  {
    id: ProviderRegistryIds.OPENROUTER,
    name: ProviderNames.OPENROUTER,
    displayName: "OpenRouter",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "openrouter.png",
    descriptionKey: "openrouter_translate_description",
    titleKey: "openrouter_settings_title",
    importFunction: () => import("./OpenRouter.js").then(m => ({ default: m.OpenRouterProvider })),
    features: ["text", "context", "smart"],
    needsApiKey: true,
    supported: true,
  },
  {
    id: ProviderRegistryIds.DEEPSEEK,
    name: ProviderNames.DEEPSEEK,
    displayName: "DeepSeek",
    type: ProviderTypes.AI,
    category: ProviderCategories.AI,
    icon: "deepseek.png",
    descriptionKey: "deepseek_translate_description",
    titleKey: "deepseek_settings_title",
    importFunction: () => import("./DeepSeek.js").then(m => ({ default: m.DeepSeekProvider })),
    features: ["text", "context", "smart", "thinking"],
    needsApiKey: true,
    supported: true,
  },
  {
    id: ProviderRegistryIds.WEBAI,
    name: ProviderNames.WEBAI,
    displayName: "WebAI Local Server",
    type: ProviderTypes.AI,
    category: ProviderCategories.LOCAL,
    icon: "webai.png",
    descriptionKey: "webai_translate_description",
    titleKey: "webai_settings_title",
    importFunction: () => import("./WebAI.js").then(m => ({ default: m.WebAIProvider })),
    features: ["text", "context", "offline"],
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
    descriptionKey: "google_translate_description",
    titleKey: "google_translate_settings_title",
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
    descriptionKey: "lingva_translate_description",
    titleKey: "lingva_translate_settings_title",
    importFunction: () => import("./LingvaProvider.js").then(m => ({ default: m.LingvaProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.BING,
    name: ProviderNames.BING_TRANSLATE,
    displayName: "Bing Translate",
    type: ProviderTypes.TRANSLATE,
    category: ProviderCategories.FREE,
    icon: "bing.png",
    descriptionKey: "bing_translate_description",
    titleKey: "bing_translate_settings_title",
    importFunction: () => import("./BingTranslate.js").then(m => ({ default: m.BingTranslateProvider })),
    features: ["text", "autoDetect"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.BROWSER,
    name: ProviderNames.BROWSER_API,
    displayName: "Browser Translation",
    type: ProviderTypes.NATIVE,
    category: ProviderCategories.BROWSER,
    icon: "chrome-translate.png",
    descriptionKey: "browser_translate_description",
    titleKey: "browser_translate_settings_title",
    importFunction: () => import("./BrowserAPI.js").then(m => ({ default: m.browserTranslateProvider })),
    features: ["text", "autoDetect", "offline"],
    needsApiKey: false,
    supported: true,
  },
  {
    id: ProviderRegistryIds.CUSTOM,
    name: ProviderNames.CUSTOM,
    displayName: "Custom Provider",
    type: ProviderTypes.CUSTOM,
    category: ProviderCategories.CUSTOM,
    icon: "custom.png",
    descriptionKey: "custom_translate_description",
    titleKey: "custom_settings_title",
    importFunction: () => import("./CustomProvider.js").then(m => ({ default: m.CustomProvider })),
    features: ["text", "context", "configurable"],
    needsApiKey: true,
    supported: true,
  },
];

/**
 * Helper: Find provider by Registry ID
 */
export const findProviderById = (id) => PROVIDER_MANIFEST.find(p => p.id === id);

/**
 * Helper: Find provider by Provider Name
 */
export const findProviderByName = (name) => PROVIDER_MANIFEST.find(p => p.name === name);

/**
 * Helper: Get all active/supported providers
 */
export const getActiveProviders = () => PROVIDER_MANIFEST.filter(p => p.supported);
