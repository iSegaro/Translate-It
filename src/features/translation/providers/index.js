// src/providers/index.js
// Central provider exports following project architecture

export { providerRegistry as ProviderRegistry } from "./ProviderRegistry.js";
export { ProviderFactory } from "./ProviderFactory.js";
export { BaseProvider } from "./BaseProvider.js";

// Registration function (providers are now lazy-loaded)
export { registerAllProviders, preloadProvider, preloadCriticalProviders } from "./register-providers.js";

// Note: Individual provider exports removed to enable code splitting
// Providers are now accessed via ProviderFactory.getProvider() with dynamic imports
