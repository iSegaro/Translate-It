import { createApp } from 'vue';
import ContentApp from '../views/content/ContentApp.vue';

// Import all necessary global styles for the content script app as raw strings.
// The `?inline` suffix tells Vite to process the CSS and return it as a string.
import sonnerStyles from 'vue-sonner/style.css?inline';
import windowsManagerStyles from '../styles/windows-manager.css?inline';
import utilityStyles from '../styles/utility-styles.css?inline';

// This function returns the combined CSS for the entire Vue application.
// This is a robust way to collect all necessary styles for shadow DOM injection.
export function getAppCss() {
  // The google font is imported separately in the content script.
  return `
    ${sonnerStyles}
    ${windowsManagerStyles}
    ${utilityStyles}
  `;
}

// This function will be exported and called by the content script
// to mount the app into the provided shadow root.
export function mountContentApp(rootElement) {
  const app = createApp(ContentApp);
  
  // We can install plugins or provide dependencies here if needed in the future
  // app.use(...);
  
  app.mount(rootElement);
  console.log('[ContentApp main.js] Vue app mounted into shadow DOM.');

  return app;
}
