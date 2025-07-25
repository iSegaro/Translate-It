import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/views/sidepanel/SidepanelApp.vue'
import '@/main.scss'
import { browserAPIReady } from '@/utils/browser-polyfill.js'

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Wait for browser API to be ready
    await browserAPIReady

    // Create Vue app
    const app = createApp(SidepanelApp)

    // Use Pinia for state management
    app.use(pinia)

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'sidepanel'

    // Error handling
    app.config.errorHandler = (err, instance, info) => {
      console.error('Sidepanel Vue Error:', err, info)
      
      // Send error to background script for logging (optional, no response expected)
      try {
        browser.runtime.sendMessage({
          source: 'vue-app',
          action: 'LOG_ERROR',
          data: {
            error: err.message,
            context: 'sidepanel',
            info
          }
        }).catch(e => {
          // Silently ignore if background script doesn't handle this
          console.debug('Background script did not respond to LOG_ERROR:', e.message)
        })
      } catch (e) {
        console.debug('Failed to send error to background:', e.message)
      }
    }

    // Mount the app
    app.mount('#app')
  } catch (error) {
    console.error('Failed to initialize sidepanel app:', error)
    // Show error UI
    document.getElementById('app').innerHTML = '<div style="padding: 16px; color: red;">Failed to load extension sidepanel. Please try reloading.</div>'
  }
}

// Initialize the app
const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}

// Lazy loading functions for advanced features
export const loadAdvancedFeatures = async () => {
  const [capture, tts, history, subtitle] = await Promise.all([
    import('@/store/modules/capture.js'),
    import('@/store/modules/tts.js'),
    import('@/store/modules/history.js'),
    import('@/store/modules/subtitle.js')
  ])
  return { capture, tts, history, subtitle }
}

export const loadProviderFeatures = async () => {
  const [aiProviders, freeProviders] = await Promise.all([
    import('@/providers/implementations/OpenAIProvider.js'),
    import('@/providers/implementations/GoogleTranslateProvider.js')
  ])
  return { aiProviders, freeProviders }
}

// Progressive loading after initial render
setTimeout(async () => {
  try {
    // Load translation features first
    const { loadTranslationFeatures } = await import('@/app/main/popup.js')
    await loadTranslationFeatures()
    
    // Then load advanced features
    await loadAdvancedFeatures()
  } catch (error) {
    console.error('Failed to preload features:', error)
  }
}, 200)