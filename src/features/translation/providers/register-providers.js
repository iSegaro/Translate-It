import { providerRegistry } from "./ProviderRegistry.js";
import { PROVIDER_MANIFEST } from "./ProviderManifest.js";

/**
 * Register all providers defined in the manifest for lazy loading.
 */
export function registerAllProviders() {
  PROVIDER_MANIFEST.forEach(config => {
    providerRegistry.registerLazy(config.id, config.importFunction, {
      id: config.id,
      name: config.displayName,
      type: config.type,
      category: config.category,
      icon: config.icon,
      features: config.features
    });
  });
}

/**
 * Preload a specific provider by its registry ID.
 */
export function preloadProvider(providerId) {
  return providerRegistry.get(providerId);
}

/**
 * Preload critical providers for faster initial translation.
 */
export function preloadCriticalProviders() {
  // We can now define critical providers by ID or even add a 'critical' flag in the manifest
  const criticalProviders = ["google", "googlev2", "bing"];
  return Promise.allSettled(
    criticalProviders.map(id => preloadProvider(id).catch(() => null))
  );
}
