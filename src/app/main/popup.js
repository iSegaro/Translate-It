import { createApp } from 'vue'
import { pinia } from '@/store'
import PopupApp from '@/views/popup/PopupApp.vue'
import '@/main.scss'
import { browserAPIReady } from '@/utils/browser-polyfill.js'

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Wait for browser API to be ready
    await browserAPIReady
    
    // Create Vue app
    const app = createApp(PopupApp)

    // Use Pinia for state management
    app.use(pinia)

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'popup'

    // Error handling
    app.config.errorHandler = (err, instance, info) => {
      console.error('Popup Vue Error:', err, info)
      
      // Send error to background script for logging (optional, no response expected)
      try {
        browser.runtime.sendMessage({
          source: 'vue-app',
          action: 'LOG_ERROR',
          data: {
            error: err.message,
            context: 'popup',
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
    console.error('Failed to initialize popup app:', error)
    // Show error UI
    document.getElementById('app').innerHTML = '<div style="padding: 16px; color: red;">Failed to load extension. Please try reloading.</div>'
  }
}

// Initialize the app
const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}

// Lazy loading functions for heavy features
export const loadTranslationFeatures = async () => {
  const [translation, providers] = await Promise.all([
    import('@/store/modules/translation.js'),
    import('@/store/modules/providers.js')
  ])
  return { translation, providers }
}

export const loadAdvancedFeatures = async () => {
  const [capture, tts, history] = await Promise.all([
    import('@/store/modules/capture.js'),
    import('@/store/modules/tts.js'),
    import('@/store/modules/history.js')
  ])
  return { capture, tts, history }
}

// Preload essential features after initial render
setTimeout(async () => {
  try {
    await loadTranslationFeatures()
  } catch (error) {
    console.error('Failed to preload translation features:', error)
  }
}, 100)