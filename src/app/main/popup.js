import { createApp } from 'vue'
import { pinia } from '@/store'
import PopupApp from '@/views/popup/PopupApp.vue'
import '@/main.scss'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals, isExtensionContextValid } from '@/error-management/windowErrorHandlers.js'
import { getScopedLogger } from '@/utils/core/logger.js';

const logger = getScopedLogger('UI', 'popup');

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('popup')
    
    // Check extension context validity
    if (!isExtensionContextValid()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }
    
    // Setup browser API globals for compatibility
    setupBrowserAPIGlobals()
    
    logger.debug('🌐 Browser API globals configured')

    // Import i18n plugin after browser API is ready and globally available
    const { default: i18n } = await import('vue-plugin-webextension-i18n')
    
    // Create Vue app
    const app = createApp(PopupApp)

    // Use plugins (order matters: Pinia first, then i18n)
    app.use(pinia)
    app.use(i18n)

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'popup'

    // Setup unified error handling
    setupGlobalErrorHandler(app, 'popup')

    // Mount the app
    app.mount('#app')
  } catch (error) {
    logger.error('Failed to initialize popup app:', error)
    // Show error UI
    document.getElementById('app').innerHTML = '<div style="padding: 16px; color: red;">Failed to load extension. Please try reloading.</div>'
  }
}

// Initialize the app
const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}

// Lazy loading functions for heavy features (only load when needed)
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