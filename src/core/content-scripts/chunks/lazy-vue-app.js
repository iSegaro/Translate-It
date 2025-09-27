// src/core/content-scripts/chunks/lazy-vue-app.js
// Lazy-loaded Vue application and all UI components

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import { isDevelopmentMode } from '@/shared/utils/environment.js';
import ExtensionContextManager from '@/core/extensionContext.js';

// Import Vue and dependencies (these will be chunked separately by Vite)
import { createApp } from 'vue';
import { createPinia } from 'pinia';

// Import the main Vue app component
import ContentApp from '@/apps/content/ContentApp.vue';

// Import UI utilities
import { setupTrustedTypesCompatibility } from '@/shared/vue/vue-utils.js';

// Import global styles for the app
import contentAppStyles from '@/assets/styles/content-app-global.scss?inline';

const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'LazyVueApp');

let vueApp = null;
let pinia = null;

export async function loadVueApp(contentCore) {
  if (vueApp) {
    logger.debug('Vue app already mounted');
    return;
  }

  try {
    logger.debug('Loading Vue application...');

    // Validate extension context
    if (!ExtensionContextManager.isValidSync()) {
      logger.warn('Extension context invalid, skipping Vue app load');
      return;
    }

    // Setup trusted types compatibility
    setupTrustedTypesCompatibility();

    // Create Vue app
    const app = createApp(ContentApp);

    // Setup Pinia
    pinia = createPinia();

    // Note: pinia-plugin-persistedstate removed as it's not used in the codebase

    app.use(pinia);

    // Mount the app
    const mountPoint = await createMountPoint();
    app.mount(mountPoint);

    vueApp = app;

    // Store reference globally for debugging
    window.translateItVueApp = app;

    logger.info('Vue application mounted successfully');

    // Notify content core that Vue is ready
    if (contentCore) {
      contentCore.vueLoaded = true;
      contentCore.dispatchEvent(new CustomEvent('vue-loaded'));
    }

    // Preload features in background
    setTimeout(() => {
      if (contentCore) {
        contentCore.loadFeatures();
      }
    }, 1000);

  } catch (error) {
    logger.error('Failed to load Vue app:', error);
    throw error;
  }
}

async function createMountPoint() {
  const isInIframe = window !== window.top;
  const hostId = `translate-it-host-${isInIframe ? 'iframe' : 'main'}`;

  // Check if host already exists
  let hostElement = document.getElementById(hostId);

  if (!hostElement) {
    // Create shadow host for isolation
    hostElement = document.createElement('div');
    hostElement.id = hostId;

    // Create shadow root
    const shadowRoot = hostElement.attachShadow({ mode: 'open' });

    // Create container for Vue app
    const appContainer = document.createElement('div');
    appContainer.id = 'translate-it-app-container';

    // Add default styles
    const resetStyles = document.createElement('style');
    resetStyles.textContent = `
      :host {
        all: initial;
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 2147483647;
      }

      #translate-it-app-container {
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      #translate-it-app-container > * {
        pointer-events: auto;
      }
    `;

    shadowRoot.appendChild(resetStyles);

    // Add main app styles
    const appStyles = document.createElement('style');
    appStyles.textContent = contentAppStyles;
    shadowRoot.appendChild(appStyles);

    shadowRoot.appendChild(appContainer);

    // Add to document
    document.body.appendChild(hostElement);

    logger.debug(`Created Vue mount point: ${hostId}`);
  }

  // Return the app container within shadow root
  return hostElement.shadowRoot.getElementById('translate-it-app-container');
}

// Export cleanup function
export function cleanupVueApp() {
  if (vueApp) {
    logger.debug('Cleaning up Vue app...');

    try {
      vueApp.unmount();
      vueApp = null;
      pinia = null;

      // Remove mount point
      const hostElement = document.getElementById('translate-it-host-main') ||
                         document.getElementById('translate-it-host-iframe');
      if (hostElement) {
        hostElement.remove();
      }

      logger.info('Vue app cleaned up successfully');
    } catch (error) {
      logger.error('Error cleaning up Vue app:', error);
    }
  }
}

// Export for dynamic import
export default {
  loadVueApp,
  cleanupVueApp
};