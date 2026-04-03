// Helper macro to load i18n plugin async in Vue apps

import { loadI18nPlugin } from './plugin-async-loader.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.I18N, 'vue-i18n-macro');

/**
 * Create Vue app with async i18n plugin loading for optimal performance
 */
export async function createAppWithI18n(rootComponent) {
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
    logger.warn('Failed to load i18n plugin, continuing without it:', error.message);
  }

  return app;
}