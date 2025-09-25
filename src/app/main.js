import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ContentApp from '../apps/content/ContentApp.vue';
import { utilsFactory } from '@/utils/UtilsFactory.js';
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
export async function mountContentApp(rootElement) {
  const app = configureVueForCSP(createApp(ContentApp));
  app.use(createPinia());

  // Load i18n plugin asynchronously to prevent TDZ
  try {
    const { i18nPlugin } = await utilsFactory.getI18nUtils();
    app.use(i18nPlugin);
  } catch (error) {
    console.warn('Failed to load i18n plugin in content app:', error);
  }

  app.mount(rootElement);
  const logger = getScopedLogger(LOG_COMPONENTS.CONTENT, 'mountContentApp');
  logger.info('Vue app mounted into shadow DOM.');
  return app;
}