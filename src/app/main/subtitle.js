import { createApp } from 'vue'
import { pinia } from '@/store'
import SubtitleApp from '@/apps/subtitle/SubtitleApp.vue'
import '@/assets/styles/main.scss'
import { setupGlobalErrorHandler } from '@/composables/shared/useErrorHandler.js'
import { setupWindowErrorHandlers, setupBrowserAPIGlobals } from '@/shared/error-management/windowErrorHandlers.js'
import ExtensionContextManager from '@/core/extensionContext.js'
import { getScopedLogger } from '@/shared/logging/logger.js';
import { LOG_COMPONENTS } from '@/shared/logging/logConstants.js';
import { configureVueForCSP } from '@/shared/vue/vue-utils.js';

const logger = getScopedLogger(LOG_COMPONENTS.SUBTITLE, 'subtitle-entry');

// Initialize and mount Vue app after browser API is ready
async function initializeApp() {
  try {
    // Add context class to body
    document.body.classList.add('subtitle-context')
    
    // Setup global error handlers before anything else
    setupWindowErrorHandlers('subtitle')
    
    // Check extension context validity
    if (!ExtensionContextManager.isValidSync()) {
      throw new Error('Browser runtime not available - extension context may be invalid')
    }
    
    // Setup browser API globals for compatibility
    setupBrowserAPIGlobals()
    
    // Import unified i18n plugin after browser API is ready and globally available
    const { default: i18n } = await import('@/utils/i18n/plugin.js')
    
    // Create Vue app
    const app = configureVueForCSP(createApp(SubtitleApp))

    // Use plugins (order matters: Pinia first, then i18n)
    app.use(pinia)
    app.use(i18n)

    // Global properties for extension context
    app.config.globalProperties.$isExtension = true
    app.config.globalProperties.$context = 'subtitle'

    // Setup unified error handling
    setupGlobalErrorHandler(app, 'subtitle')

    // Mount the app
    app.mount('#app')
    logger.debug('Subtitle app mounted successfully')
  } catch (error) {
    logger.error('Failed to initialize subtitle app:', error)
    // Show error UI
    const appElement = document.getElementById('app')
    if (appElement) {
      appElement.textContent = '' 
      const errorDiv = document.createElement('div')
      errorDiv.style.cssText = 'padding: 24px; color: #ef4444; text-align: center; font-family: sans-serif;'
      errorDiv.textContent = 'Failed to load Subtitle Translator. Please try reloading the page.'
      appElement.appendChild(errorDiv)
    }
  }
}

// Initialize the app
const appElement = document.getElementById('app')
if (appElement && !appElement.__vue_app__) {
  initializeApp()
}
