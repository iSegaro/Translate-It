import { createApp } from 'vue'
import { pinia } from '@/store'
import PopupApp from '@/views/popup/PopupApp.vue'
import '@/main.scss'
import browser from 'webextension-polyfill'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { ErrorHandler } from '@/error-management/ErrorHandler.js'
import { ErrorTypes } from '@/error-management/ErrorTypes.js'
import { matchErrorToType } from '@/error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/utils/core/logger.js';
const logger = getScopedLogger('UI', 'popup');

/**
 * Setup window-level error handlers for extension context issues
 */
function setupWindowErrorHandlers(context) {
  const errorHandler = new ErrorHandler()
  
  // Handle uncaught errors (including from third-party libraries)
  window.addEventListener('error', async (event) => {
    const error = event.error || new Error(event.message)
    const errorType = matchErrorToType(error?.message || error)
    
    // Only handle extension context related errors silently
    if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED || errorType === ErrorTypes.CONTEXT) {
      await errorHandler.handle(error, {
        type: errorType,
        context: `${context}-window`,
        silent: true
      })
      event.preventDefault()
    }
  })
  
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', async (event) => {
    const error = event.reason
    const errorType = matchErrorToType(error?.message || error)
    
    // Only handle extension context related errors silently
    if (errorType === ErrorTypes.EXTENSION_CONTEXT_INVALIDATED || errorType === ErrorTypes.CONTEXT) {
      await errorHandler.handle(error, {
        type: errorType,
        context: `${context}-promise`,
        silent: true
      })
      event.preventDefault()
    }
  })
}

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('popup')
    
    // Wait for browser API to be ready
    
    // Ensure browser API is globally available for i18n plugin
    if (typeof window !== 'undefined') {
      window.browser = browser;
      window.chrome = browser; // Some plugins expect chrome object
    }

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

// Note: Removed preloading to reduce popup bundle size
// Features will be loaded on-demand when actually needed