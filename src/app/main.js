import { createApp } from 'vue';
import ContentApp from '../views/content/ContentApp.vue';
import i18n from '../plugins/i18n';

// Import all necessary styles as raw strings using Vite's `?inline` feature.
import combinedGlobalStyles from '../styles/content-app-global.css?inline';

/**
 * This function returns the combined CSS for the entire Vue application.
 * This is a robust way to collect all necessary styles for shadow DOM injection.
 */
export function getAppCss() {
  // The google font is imported separately in the content script.
  return combinedGlobalStyles;
}

/**
 * This function will be exported and called by the content script
 * to mount the app into the provided shadow root.
 * 
 * @param {HTMLElement} rootElement - The element inside the shadow root to mount the Vue app.
 */
export function mountContentApp(rootElement) {
  const app = createApp(ContentApp);
  app.use(i18n);
  app.mount(rootElement);
  console.log('[ContentApp main.js] Vue app mounted into shadow DOM.');
  return app;
}