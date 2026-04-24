/**
 * Provider Validator Utility
 * 
 * Provides logic to check if a translation provider is correctly configured
 * based on its required settings (API keys, URLs, etc.) defined in the manifest.
 */

import { findProviderById } from '../providers/ProviderManifest.js';

/**
 * Checks if a provider has all its essential settings configured.
 * 
 * @param {string} providerId - The ID of the provider to check.
 * @param {Object} settings - The current settings object (from settings store).
 * @returns {boolean} - True if all required settings are present and not empty.
 */
export const isProviderConfigured = (providerId, settings) => {
  if (!providerId || !settings) return true;

  const provider = findProviderById(providerId);
  
  // If provider not found or has no required settings, consider it "configured" (or at least not needing action)
  if (!provider || !provider.requiredSettings || !Array.isArray(provider.requiredSettings)) {
    return true;
  }

  // Check if every required setting key has a non-empty value
  return provider.requiredSettings.every(key => {
    const value = settings[key];
    
    // Check for null, undefined, or empty string (after trimming)
    if (value === null || value === undefined) return false;
    
    if (typeof value === 'string') {
      return value.trim() !== '';
    }
    
    // For non-string types, existence is enough
    return true;
  });
};
