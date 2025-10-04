// src/utils/i18n/vue-i18n-macro.js
// Helper macro to load i18n plugin async in Vue apps

import { loadI18nPlugin } from './plugin-async-loader.js';

/**
 * Create Vue app with async i18n plugin loading
 * This prevents TDZ errors in main app files
 */
export async function createAppWithI18n(rootComponent, options = {}) {
  const { createApp } = await import('vue');
  const { createPinia } = await import('pinia');

  const app = createApp(rootComponent);
  const pinia = createPinia();

  app.use(pinia);

  // Load i18n plugin asynchronously
  try {
    const i18n = await loadI18nPlugin();
    app.use(i18n);
  } catch (error) {
    console.warn('Failed to load i18n plugin, continuing without it:', error);
  }

  return app;
}