import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/views/sidepanel/SidepanelLayout.vue'
import '@/main.scss'
import browser from 'webextension-polyfill'
import { MessagingContexts } from '../../messaging/core/MessagingCore'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { ErrorHandler } from '@/error-management/ErrorHandler.js'
import { ErrorTypes } from '@/error-management/ErrorTypes.js'
import { matchErrorToType } from '@/error-management/ErrorMatcher.js'
import { getScopedLogger } from '@/utils/core/logger.js';
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'sidepanel-main')

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
      event.preventDefault() // Prevent default browser error handling
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
      event.preventDefault() // Prevent unhandled rejection
    }
  })
}

// Initialize the sidepanel application
async function initializeApp() {
  try {
    logger.debug('🚀 Initializing sidepanel...')

    // Setup global error handlers before anything else
    setupWindowErrorHandlers('sidepanel')
    
    if (!browser?.runtime) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }

    // Global browser API check and setup
    if (!window.browser) {
      window.browser = browser
      logger.debug('🌐 Browser API set on window object')
    }

    // Import i18n plugin after browser API is ready and globally available
    logger.debug('📦 Importing i18n plugin...')
    const { default: i18n } = await import('vue-plugin-webextension-i18n')
    logger.debug('✅ i18n plugin imported successfully')

    // Create Vue app
    logger.debug('🎨 Creating Vue app...')
    const app = createApp(SidepanelApp)

    // Use Pinia for state management
    logger.debug('🔌 Installing Pinia...')
    app.use(pinia)
    logger.debug('✅ Pinia installed')
    
    logger.debug('🔌 Installing i18n...')
    app.use(i18n)
    logger.debug('✅ i18n installed')

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = MessagingContexts.SIDEPANEL

    // Setup unified error handling
    setupGlobalErrorHandler(app, 'sidepanel')

    // Mount the app
    app.mount('#app')
  } catch (error) {
    logger.error('Failed to initialize sidepanel app:', error)
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
  // Providers are now handled by the background service worker
  // UI contexts use TranslationClient for messaging
  return { aiProviders: null, freeProviders: null }
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
    logger.error('Failed to preload features:', error)
  }
}, 200)