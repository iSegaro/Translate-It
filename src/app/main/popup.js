import { createApp } from 'vue'
import { pinia } from '@/store'
import PopupApp from '@/apps/popup/PopupApp.vue'
import '@/assets/styles/main.scss'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';

const logger = getScopedLogger(LOG_COMPONENTS.POPUP, 'popup');

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Add popup context class to body
    document.body.classList.add('popup-context')
    logger.debug('✅ Added popup-context class to body')
    
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('popup')
    
    // Check extension context validity
    if (!ExtensionContextManager.isValidSync()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }
    
    // Setup browser API globals for compatibility
    setupBrowserAPIGlobals()
    
    logger.debug('🌐 Browser API globals configured')

    // Import unified i18n plugin after browser API is ready and globally available
    const { default: i18n } = await import('@/utils/i18n/plugin.js')
    
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
    import('@/features/translation/stores/translation.js'),
    import('@/store/modules/providers.js')
  ])
  return { translation, providers }
}

export const loadAdvancedFeatures = async () => {
  const [capture, history] = await Promise.all([
    import('@/features/screen-capture/stores/capture.js'),
    import('@/features/history/stores/history.js')
  ])
  return { capture, history }
}