import { createApp } from 'vue'
import { pinia } from '@/store'
import PopupApp from '@/views/popup/PopupApp.vue'
import '@/main.scss'
import '@/utils/browser-polyfill.js'

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
  
  // Send error to background script for logging
  try {
    browser.runtime.sendMessage({
      action: 'LOG_ERROR',
      data: {
        error: err.message,
        context: 'popup',
        info
      }
    })
  } catch (e) {
    console.error('Failed to send error to background:', e)
  }
}

// Mount the app
app.mount('#app')

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