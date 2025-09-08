import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ContentApp from '../apps/content/ContentApp.vue';
import i18n from '@/utils/i18n/plugin.js';
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { configureVueForCSP } from '@/shared/vue/vue-utils.js';

// Import all necessary styles as raw strings using Vite's `?inline` feature.
import combinedGlobalStyles from '../assets/styles/content-app-global.scss?inline';

// Function to extract Vue component styles from the document
function extractVueComponentStyles() {
  const vueStyles = [];
  
  // In development, Vue injects styles into the document head
  if (typeof document !== 'undefined') {
    const styleElements = document.querySelectorAll('style[data-vite-dev-id]');
    styleElements.forEach(style => {
      if (style.textContent) {
        vueStyles.push(style.textContent);
      }
    });
    
    // Also check for Vue scoped styles
    const scopedStyles = document.querySelectorAll('style[scoped]');
    scopedStyles.forEach(style => {
      if (style.textContent) {
        vueStyles.push(style.textContent);
      }
    });
  }
  
  return vueStyles.join('\n');
}

// Function to create a temporary Vue app and extract its styles
function preloadVueStyles() {
  if (typeof document === 'undefined') return '';
  
  // Create a hidden container to mount Vue app temporarily
  const tempContainer = document.createElement('div');
  tempContainer.style.display = 'none';
  tempContainer.style.position = 'absolute';
  tempContainer.style.top = '-9999px';
  document.body.appendChild(tempContainer);
  
  try {
    // Create and mount the app temporarily to trigger style injection
    const tempApp = configureVueForCSP(createApp(ContentApp));
    tempApp.use(createPinia());
    tempApp.use(i18n);
    const mountedApp = tempApp.mount(tempContainer);
    
    // Extract styles after mounting
    const extractedStyles = extractVueComponentStyles();
    
    // Cleanup
    tempApp.unmount();
    document.body.removeChild(tempContainer);
    
    return extractedStyles;
  } catch (error) {
    // Cleanup on error
    if (document.body.contains(tempContainer)) {
      document.body.removeChild(tempContainer);
    }
    const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'preloadVueStyles');
    logger.warn('Could not extract Vue component styles:', error);
    return '';
  }
}

/**
 * This function returns the combined CSS for the entire Vue application.
 * This includes both global styles and Vue component styles.
 */
export function getAppCss() {
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'getAppCss');
  let allStyles = combinedGlobalStyles;
  
  // Extract Vue component styles
  const vueComponentStyles = extractVueComponentStyles();
  if (vueComponentStyles) {
    allStyles += '\n/* Vue Component Styles */\n' + vueComponentStyles;
    logger.debug('Extracted Vue styles:', vueComponentStyles.length, 'characters');
  }
  
  logger.debug('Total CSS length:', allStyles.length, 'characters');
  logger.debug('Global styles length:', combinedGlobalStyles.length, 'characters');
  
  return allStyles;
}

/**
 * This function will be exported and called by the content script
 * to mount the app into the provided shadow root.
 * 
 * @param {HTMLElement} rootElement - The element inside the shadow root to mount the Vue app.
 */
export function mountContentApp(rootElement) {
  const app = configureVueForCSP(createApp(ContentApp));
  app.use(createPinia());
  app.use(i18n);
  app.mount(rootElement);
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'mountContentApp');
  logger.info('Vue app mounted into shadow DOM.');
  return app;
}