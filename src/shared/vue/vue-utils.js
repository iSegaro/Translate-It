/**
 * Vue.js utility functions for the Translate-It extension
 * Provides shared utilities for Vue app configuration and CSP compatibility
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'VueUtils');

/**
 * Configure Vue app for CSP (Content Security Policy) compatibility
 * This function handles Vue.js configuration to work within browser extension CSP restrictions
 *
 * @param {Object} app - Vue app instance
 * @returns {Object} - Configured Vue app instance
 */
export function configureVueForCSP(app) {
  // Configure Vue to handle CSP restrictions
  app.config.compilerOptions = {
    ...(app.config.compilerOptions || {}),
    isCustomElement: tag => tag.startsWith('translate-it-')
  };

  // Disable CSP warnings in production
  app.config.warnHandler = (msg, instance, trace) => {
    if (msg.includes('TrustedTypePolicy') || msg.includes('trusted-types')) {
      return;
    }
    console.warn('[Vue warn]:', msg, trace);
  };

  logger.debug('Vue app configured for CSP compatibility');
  return app;
}

/**
 * Create a Vue app with CSP configuration
 * Convenience function that combines createApp with CSP configuration
 *
 * @param {Object} component - Vue component
 * @param {Object} props - Component props
 * @returns {Object} - Configured Vue app instance
 */
export function createVueApp(component, props = {}) {
  const { createApp } = require('vue');
  const app = createApp(component, props);
  return configureVueForCSP(app);
}
