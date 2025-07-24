import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/views/sidepanel/SidepanelApp.vue'
import '@/assets/styles/global.scss'

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
  
  // Send error to background script for logging
  try {
    browser.runtime.sendMessage({
      action: 'LOG_ERROR',
      data: {
        error: err.message,
        context: 'sidepanel',
        info
      }
    })
  } catch (e) {
    console.error('Failed to send error to background:', e)
  }
}

// Mount the app
app.mount('#app')

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