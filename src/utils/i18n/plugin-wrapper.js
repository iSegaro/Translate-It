// src/utils/i18n/plugin-wrapper.js
// TDZ-Safe wrapper for i18n plugin

let i18nPluginCache = null;

/**
 * TDZ-Safe loader for i18n plugin
 */
export async function getI18nPlugin() {
  if (!i18nPluginCache) {
    try {
      // Try dynamic import to avoid TDZ
      const module = await import('./plugin.js');
      i18nPluginCache = module.default;
    } catch (error) {
      console.warn('Failed to load i18n plugin safely:', error);
      // Return a noop plugin as fallback
      i18nPluginCache = {
        install: () => {}
      };
    }
  }
  return i18nPluginCache;
}

/**
 * Clear plugin cache
 */
export function clearI18nPluginCache() {
  i18nPluginCache = null;
}