// src/core/content-scripts/chunks/lazy-vue-app.js
// Lazy-loaded Vue application and all UI components

import { getScopedLogger } from "@/shared/logging/logger.js";
import { LOG_COMPONENTS } from "@/shared/logging/logConstants.js";
import ExtensionContextManager from '@/core/extensionContext.js';
import { utilsFactory } from '@/utils/UtilsFactory.js';

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

function isSuitableEnvironmentForVue() {
  // Check if document.body exists and is accessible
  if (!document.body) {
    logger.debug('Document body not available for Vue mounting');
    return false;
  }

  // Check if we're in a browser-generated XML/JSON viewer page
  // More specific detection to avoid blocking legitimate content pages like GitHub
  const isBrowserXMLViewer =
    // Chrome/Firefox XML viewer specific elements
    document.body.querySelector('#webkit-xml-viewer-source-xml') !== null ||
    document.body.querySelector('[data-viewer="xml"]') !== null ||
    // Firefox JSON viewer specific elements
    document.body.querySelector('#json') !== null && document.body.querySelector('.toolbar') !== null ||
    // Browser error pages about XML/JSON
    document.title?.includes('XML page cannot be displayed') ||
    document.title?.includes('JSON page cannot be displayed') ||
    // Generic XML viewer with specific URL patterns
    (window.location.pathname.endsWith('.xml') && document.body.children.length <= 2) ||
    (window.location.pathname.endsWith('.json') && document.body.children.length <= 2);

  if (isBrowserXMLViewer) {
    logger.debug('Detected browser XML/JSON viewer page, skipping Vue app mount');
    return false;
  }

  // Check if the page has minimal HTML structure needed for Vue
  if (!document.head || !document.body) {
    logger.debug('Page lacks basic HTML structure for Vue');
    return false;
  }

  // Check if documentElement is accessible
  if (!document.documentElement || !document.documentElement.style) {
    logger.debug('Document element not properly accessible for Vue');
    return false;
  }

  // Check if we can safely create elements in the DOM
  try {
    const testElement = document.createElement('div');

    // Test with valid CSS properties instead of custom properties
    testElement.style.setProperty('display', 'block');
    const retrievedValue = testElement.style.getPropertyValue('display');

    // Also test direct assignment
    testElement.style.color = 'red';
    const directValue = testElement.style.color;

    if (retrievedValue !== 'block' && directValue !== 'red') {
      logger.debug('Cannot safely set styles on elements, skipping Vue app');
      return false;
    }
  } catch (error) {
    logger.debug('DOM manipulation test failed, skipping Vue app:', error);
    return false;
  }

  return true;
}

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

    // Check if we're in a suitable environment for Vue app mounting
    if (!isSuitableEnvironmentForVue()) {
      logger.info('Environment not suitable for Vue app, skipping load');
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

    // Load i18n plugin asynchronously to prevent TDZ
    try {
      const { i18nPlugin } = await utilsFactory.getI18nUtils();
      app.use(i18nPlugin);
    } catch (error) {
      logger.warn('Failed to load i18n plugin in content app:', error);
    }

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
  // Verify document.body is still available before proceeding
  if (!document.body) {
    throw new Error('Document body not available for mount point creation');
  }

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
  const appContainer = hostElement.shadowRoot.getElementById('translate-it-app-container');

  if (!appContainer) {
    throw new Error('Failed to create app container in shadow root');
  }

  return appContainer;
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