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
  return !getFirstMissingSetting(providerId, settings);
};

/**
 * Identifies the first missing required setting for a provider.
 * Useful for highlighting the exact field that needs attention.
 * 
 * @param {string} providerId - The ID of the provider to check.
 * @param {Object} settings - The current settings object.
 * @returns {string|null} - The key of the first missing setting, or null if all are present.
 */
export const getFirstMissingSetting = (providerId, settings) => {
  if (!providerId || !settings) return null;

  const provider = findProviderById(providerId);
  
  if (!provider || !provider.requiredSettings || !Array.isArray(provider.requiredSettings)) {
    return null;
  }

  // Find the first required setting key that is missing or empty
  return provider.requiredSettings.find(key => {
    const value = settings[key];
    
    if (value === null || value === undefined) return true;
    
    if (typeof value === 'string') {
      return value.trim() === '';
    }
    
    return false;
  }) || null;
};
