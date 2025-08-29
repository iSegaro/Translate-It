import { createApp } from 'vue';
import ContentApp from '../views/content/ContentApp.vue';

// This function will be exported and called by the content script
// to mount the app into the provided shadow root.
export function mountContentApp(rootElement) {
  // Get all style tags in the document's head before mounting the app
  const headStyles = Array.from(document.head.getElementsByTagName('style'));

  const app = createApp(ContentApp);
  
  // We can install plugins or provide dependencies here if needed in the future
  // app.use(...);
  
  app.mount(rootElement);
  console.log('[ContentApp main.js] Vue app mounted into shadow DOM.');

  // After mounting, Vue will have added its style tags to the document's head.
  // We need to find these new style tags and move them into the shadow root
  // for the component styles to be applied correctly due to Shadow DOM encapsulation.
  const newHeadStyles = Array.from(document.head.getElementsByTagName('style'));
  const vueStyles = newHeadStyles.filter(style => !headStyles.includes(style));

  if (vueStyles.length > 0) {
    // Find the shadow root - rootElement should be inside shadow root
    const shadowRoot = rootElement.getRootNode();
    
    // Verify we have a shadow root
    if (shadowRoot && shadowRoot !== document) {
      vueStyles.forEach(style => {
        // Create a clone and add it to shadow root
        const clonedStyle = style.cloneNode(true);
        shadowRoot.appendChild(clonedStyle);
      });
      console.log(`[ContentApp main.js] Moved ${vueStyles.length} style tag(s) to shadow DOM root.`);
    } else {
      console.error('[ContentApp main.js] Could not find shadow root - styles may not be applied correctly');
      // Fallback: add to rootElement as before
      vueStyles.forEach(style => {
        rootElement.appendChild(style.cloneNode(true));
      });
    }
  } else {
    // This is normal in production builds where styles are bundled/inlined
    console.debug('[ContentApp main.js] No new Vue style tags found - styles are likely bundled or inlined (normal in production).');
  }

  return app;
}
