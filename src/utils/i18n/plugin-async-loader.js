// src/utils/i18n/plugin-async-loader.js
// Async loader for i18n plugin to prevent TDZ in main app files

// Cache for the loaded plugin
let i18nPluginCache = null;

/**
 * Load i18n plugin asynchronously to prevent TDZ
 */
export async function loadI18nPlugin() {
  if (i18nPluginCache) {
    return i18nPluginCache;
  }

  try {
    // Dynamic import to avoid TDZ
    const module = await import('./plugin.js');
    i18nPluginCache = module.default;
    return i18nPluginCache;
  } catch (error) {
    console.error('Failed to load i18n plugin:', error);
    // Return a noop plugin as fallback
    return {
      install: (app) => {
        console.warn('Using noop i18n plugin due to loading error');
      }
    };
  }
}

/**
 * Clear plugin cache
 */
export function clearI18nPluginLoaderCache() {
  i18nPluginCache = null;
}