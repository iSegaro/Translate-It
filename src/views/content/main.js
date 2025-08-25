import { createApp } from 'vue';
import ContentApp from './ContentApp.vue';

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
