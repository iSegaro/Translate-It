import { providerRegistry } from "./ProviderRegistry.js";

const providerConfigs = {
  "google": {
    importFunction: () => import("./GoogleTranslate.js").then(m => ({ default: m.GoogleTranslateProvider })),
    metadata: { id: "google", name: "Google Translate", type: "translate" }
  },
  "yandex": {
    importFunction: () => import("./YandexTranslate.js").then(m => ({ default: m.YandexTranslateProvider })),
    metadata: { id: "yandex", name: "Yandex Translate", type: "translate" }
  },
  "gemini": {
    importFunction: () => import("./GoogleGemini.js").then(m => ({ default: m.GeminiProvider })),
    metadata: { id: "gemini", name: "Google Gemini", type: "ai" }
  },
  "openai": {
    importFunction: () => import("./OpenAI.js").then(m => ({ default: m.OpenAIProvider })),
    metadata: { id: "openai", name: "OpenAI", type: "ai" }
  },
  "openrouter": {
    importFunction: () => import("./OpenRouter.js").then(m => ({ default: m.OpenRouterProvider })),
    metadata: { id: "openrouter", name: "OpenRouter", type: "ai" }
  },
  "deepseek": {
    importFunction: () => import("./DeepSeek.js").then(m => ({ default: m.DeepSeekProvider })),
    metadata: { id: "deepseek", name: "DeepSeek", type: "ai" }
  },
  "webai": {
    importFunction: () => import("./WebAI.js").then(m => ({ default: m.WebAIProvider })),
    metadata: { id: "webai", name: "WebAI", type: "ai" }
  },
  "zai": {
    importFunction: () => import("./ZAIGLM.js").then(m => ({ default: m.ZAIGLMProvider })),
    metadata: { id: "zai", name: "Z.AI GLM", type: "ai" }
  },
  "bing": {
    importFunction: () => import("./BingTranslate.js").then(m => ({ default: m.BingTranslateProvider })),
    metadata: { id: "bing", name: "Bing Translate", type: "translate" }
  },
  "browser": {
    importFunction: () => import("./BrowserAPI.js").then(m => ({ default: m.browserTranslateProvider })),
    metadata: { id: "browser", name: "Browser API", type: "native" }
  },
  "custom": {
    importFunction: () => import("./CustomProvider.js").then(m => ({ default: m.CustomProvider })),
    metadata: { id: "custom", name: "Custom Provider", type: "custom" }
  }
};

export function registerAllProviders() {
  Object.entries(providerConfigs).forEach(([id, config]) => {
    providerRegistry.registerLazy(id, config.importFunction, config.metadata);
  });
}

export function preloadProvider(providerId) {
  if (providerConfigs[providerId]) {
    return providerRegistry.get(providerId);
  }
  throw new Error(`Provider '${providerId}' not found for preloading`);
}

export function preloadCriticalProviders() {
  const criticalProviders = ["google", "bing"];
  return Promise.allSettled(
    criticalProviders.map(id => preloadProvider(id).catch(() => null))
  );
}
