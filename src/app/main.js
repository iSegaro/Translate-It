import { createApp } from 'vue';
import ContentApp from '../apps/content/ContentApp.vue';
import i18n from '../plugins/i18n';

// Import all necessary styles as raw strings using Vite's `?inline` feature.
import combinedGlobalStyles from '../styles/content-app-global.css?inline';

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
    const tempApp = createApp(ContentApp);
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
    console.warn('[getAppCss] Could not extract Vue component styles:', error);
    return '';
  }
}

/**
 * This function returns the combined CSS for the entire Vue application.
 * This includes both global styles and Vue component styles.
 */
export function getAppCss() {
  let allStyles = combinedGlobalStyles;
  
  // Extract Vue component styles
  const vueComponentStyles = extractVueComponentStyles();
  if (vueComponentStyles) {
    allStyles += '\n/* Vue Component Styles */\n' + vueComponentStyles;
    console.log('[getAppCss] Extracted Vue styles:', vueComponentStyles.length, 'characters');
  }
  
  // If no styles were extracted (e.g., in production), try preloading
  if (!vueComponentStyles.trim()) {
    console.log('[getAppCss] No Vue styles extracted, attempting preload...');
    const preloadedStyles = preloadVueStyles();
    if (preloadedStyles) {
      allStyles += '\n/* Preloaded Vue Component Styles */\n' + preloadedStyles;
      console.log('[getAppCss] Preloaded Vue styles:', preloadedStyles.length, 'characters');
    } else {
      console.log('[getAppCss] Vue component styles are handled via direct CSS injection in content-app-global.css');
    }
  }
  
  console.log('[getAppCss] Total CSS length:', allStyles.length, 'characters');
  console.log('[getAppCss] Global styles length:', combinedGlobalStyles.length, 'characters');
  
  return allStyles;
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