/**
 * Provider Registry for UI - Dynamic provider information derived from ProviderManifest
 */

import { PROVIDER_MANIFEST, ProviderCategories } from '@/features/translation/providers/ProviderManifest.js';

/**
 * Re-export ProviderCategories for UI components
 */
export const PROVIDER_CATEGORIES = ProviderCategories;

/**
 * Complete provider registry with metadata for UI
 * Automatically generated from ProviderManifest
 */
export const PROVIDER_REGISTRY = PROVIDER_MANIFEST.map(provider => ({
  id: provider.id,
  name: provider.displayName,
  description: provider.descriptionKey, // Will be used with i18n
  icon: `providers/${provider.icon}`,
  category: provider.category,
  needsApiKey: provider.needsApiKey,
  supported: provider.supported,
  features: provider.features,
  // These can be moved to manifest later for full control
  languages: provider.type === 'ai' ? 100 : (provider.id === 'deepl' ? 35 : 100),
  rateLimit: provider.needsApiKey ? "API dependent" : "None",
  quality: provider.type === 'ai' ? "Very High" : "High",
  speed: provider.id === 'browser' ? "Very Fast" : "Fast",
}));

// For backward compatibility and easy access
const FALLBACK_PROVIDERS = PROVIDER_REGISTRY;

// Export functions for compatibility
export const getProvidersForDropdown = () => FALLBACK_PROVIDERS.filter(p => p.supported);
export const getProviderById = (id) => FALLBACK_PROVIDERS.find(p => p.id === id);
export const getSupportedProviders = () => FALLBACK_PROVIDERS.filter(p => p.supported);

// Export class for compatibility
export class ProviderRegistry {
  static getAll() {
    return FALLBACK_PROVIDERS.filter(p => p.supported);
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
