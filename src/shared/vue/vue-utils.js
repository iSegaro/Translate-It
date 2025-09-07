/**
 * Vue.js utility functions for the Translate-It extension
 * Provides shared utilities for Vue app configuration and CSP compatibility
 */

import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'VueUtils');

// Track if Trusted Types compatibility has been set up
let trustedTypesSetupComplete = false;

/**
 * Handle Trusted Types CSP compatibility
 * This function ensures Vue can work with restrictive CSP policies
 */
export function setupTrustedTypesCompatibility() {
  // Prevent multiple setups
  if (trustedTypesSetupComplete) {
    return;
  }
  
  // Check if Trusted Types API is available
  if (typeof window !== 'undefined' && window.trustedTypes) {
    logger.debug('Setting up Trusted Types compatibility...');
    
    // Store original createPolicy function
    const originalCreatePolicy = window.trustedTypes.createPolicy;
    
    // Override createPolicy to handle 'vue' policy requests
    window.trustedTypes.createPolicy = function(name, rules) {
      logger.debug(`Intercepted Trusted Types policy creation: ${name}`);
      
      if (name === 'vue') {
        // Try to return an existing allowed policy
        try {
          // First try 'default' policy
          return window.trustedTypes.getPolicy('default');
        } catch {
          // Try other common policies from the CSP
          const fallbackPolicies = ['dompurify', 'nextjs', 'script-url#webpack', 'html2canvas-feedback'];
          for (const policyName of fallbackPolicies) {
            try {
              const policy = window.trustedTypes.getPolicy(policyName);
              if (policy) {
                logger.debug(`Using fallback policy: ${policyName}`);
                return policy;
              }
            } catch {
              // Continue to next policy
            }
          }
        }
        
        // If no existing policies work, create a no-op policy
        logger.debug('Creating no-op fallback policy for vue');
        return {
          createHTML: (html) => html,
          createScript: (script) => script,
          createScriptURL: (url) => url
        };
      }
      
      // For non-vue policies, use original function
      return originalCreatePolicy.call(this, name, rules);
    };
    
    logger.debug('Trusted Types compatibility setup complete');
  }
  
  // Mark setup as complete
  trustedTypesSetupComplete = true;
}

// Initialize Trusted Types compatibility immediately when module loads
if (typeof window !== 'undefined') {
  setupTrustedTypesCompatibility();
}

/**
 * Configure Vue app for CSP (Content Security Policy) compatibility
 * This function handles Vue.js configuration to work within browser extension CSP restrictions
 *
 * @param {Object} app - Vue app instance
 * @returns {Object} - Configured Vue app instance
 */
export function configureVueForCSP(app) {
  // Setup Trusted Types compatibility first
  setupTrustedTypesCompatibility();
  
  // Configure Vue to handle CSP restrictions
  app.config.compilerOptions = {
    ...(app.config.compilerOptions || {}),
    isCustomElement: tag => tag.startsWith('translate-it-'),
    // Completely disable Trusted Types to prevent CSP violations
    trustedTypes: false
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
