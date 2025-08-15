import { createApp } from 'vue'
import { pinia } from '@/store'
import SidepanelApp from '@/views/sidepanel/SidepanelApp.vue'
import '@/main.scss'
import browser from 'webextension-polyfill'
import { MessagingContexts } from '@/messaging/core/MessagingCore.js'
import { setupGlobalErrorHandler } from '@/composables/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals, isExtensionContextValid } from '@/error-management/windowErrorHandlers.js'
import { getScopedLogger } from '@/utils/core/logger.js'
import { LOG_COMPONENTS } from '@/utils/core/logConstants.js'

const logger = getScopedLogger(LOG_COMPONENTS.UI, 'sidepanel-main')

// Initialize the sidepanel application
async function initializeApp() {
  try {
    logger.debug('🚀 Initializing sidepanel...')

    // Setup global error handlers before anything else
    setupWindowErrorHandlers('sidepanel')
    
    // Check extension context validity
    if (!isExtensionContextValid()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }

    // Setup browser API globals for compatibility
    setupBrowserAPIGlobals()
    
    logger.debug('🌐 Browser API globals configured')

    // Debug browser API availability for i18n
    if (logger.isDebugEnabled()) {
      logger.debug('🔍 Browser API Debug Info:', {
        'browser.runtime': !!browser.runtime,
        'browser.runtime.getURL': !!browser.runtime?.getURL,
        'browserAPI.i18n': !!browser.i18n,
        'browserAPI.i18n.getMessage': !!browser.i18n?.getMessage,
        'window.browser.i18n': !!window.browser.i18n,
        'chrome.i18n (native)': !!chrome?.i18n
      });
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

export const loadTranslationFeatures = async () => {
  const [translation, providers] = await Promise.all([
    import('@/store/modules/translation.js'),
    import('@/store/modules/providers.js')
  ])
  return { translation, providers }
}