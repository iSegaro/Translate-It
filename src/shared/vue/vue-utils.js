/**
 * Vue.js Utility Functions for Browser Extension CSP Compatibility
 *
 * This module provides essential utilities for Vue.js applications running in browser extensions,
 * with special handling for Content Security Policy (CSP) restrictions, particularly Trusted Types.
 *
 * ## 🎯 Purpose
 * Browser extensions run in hostile environments where host pages may have strict CSP policies.
 * Vue.js automatically tries to create Trusted Types policies, but these may violate the host page's CSP.
 * This module provides comprehensive protection against such CSP violations.
 *
 * ## 🔧 Key Features
 * - **Trusted Types CSP Compatibility**: Prevents TrustedTypePolicy creation errors
 * - **Vue.js CSP Configuration**: Configures Vue to work within extension CSP restrictions
 * - **Smart Fallback System**: Multiple layers of fallback for maximum compatibility
 * - **Cross-Browser Support**: Works across different CSP configurations
 *
 * ## 🛡️ Trusted Types Handling Strategy
 *
 * ### The Problem
 * - Vue.js automatically creates a Trusted Types policy named 'vue'
 * - Host pages (like Microsoft OneDrive) have CSP that doesn't allow 'vue' policy
 * - Content scripts inherit host page CSP restrictions
 * - Result: "Refused to create a TrustedTypePolicy named 'vue'" error
 *
 * ### The Solution
 * 1. **Early Monkey-Patching**: Intercept Trusted Types API before Vue loads
 * 2. **Smart Redirection**: Redirect 'vue' policy requests to allowed policies
 * 3. **Graceful Fallback**: Use no-op policies when no alternatives exist
 * 4. **Vue Configuration**: Disable Trusted Types in Vue compiler options
 *
 * ### Fallback Priority
 * 1. Use existing 'default' policy (most common)
 * 2. Try other allowed policies (dompurify, nextjs, script-url#webpack, etc.)
 * 3. Fall back to no-op policy (safe but minimal functionality)
 *
 * ## 📋 Usage
 * ```javascript
 * import { configureVueForCSP } from '@/shared/vue/vue-utils.js';
 *
 * const app = configureVueForCSP(createApp(MyComponent));
 * ```
 *
 * ## 🔍 Debugging
 * Enable debug logging to see which fallback is being used:
 * ```javascript
 * // Check console for messages like:
 * // "Using fallback policy: default"
 * // "Creating no-op fallback policy for vue"
 * ```
 *
 * ## 🚀 Future Considerations
 * - Monitor CSP changes in major websites
 * - Update fallback policy list as needed
 * - Consider Vue.js updates that might change Trusted Types behavior
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
  
  // Note: compilerOptions are now configured at build time in vite config
  // Runtime compilerOptions are not supported in Vue runtime-only builds

  // Disable specific warnings in production
  app.config.warnHandler = (msg, instance, trace) => {
    if (msg.includes('TrustedTypePolicy') || 
        msg.includes('trusted-types') ||
        msg.includes('compilerOptions') ||
        msg.includes('runtime compiler')) {
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
